import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { collectCandidate, type CollectorDependencies } from "../src/collect.js";
import type { PilotConfig } from "../src/domain/types.js";
import { buildSyntheticPage, selectionUrl } from "./fixtures/selection/synthetic-pages.js";

const nowMs = Date.parse("2026-08-18T13:09:16Z");
const config: PilotConfig = {
  config_version: "1.0.0",
  release_identity: "Drupal 11 release line / 11.x-dev",
  selection_url: selectionUrl,
  user_agent: "Zivtech-Drupal-OpenACR-Pilot/0.1 (+https://github.com/zivtech/drupal-openacr-pilot)",
  allowed_hosts: ["www.drupal.org"],
  max_records: 25,
  max_response_bytes: 2_097_152,
  request_timeout_ms: 30_000,
  max_attempts: 3,
  max_redirects: 3,
  base_backoff_ms: 1_000,
  max_backoff_ms: 30_000,
  max_jitter_ms: 250,
  freshness_window_ms: 86_400_000,
  minimum_live_run_interval_ms: 3_600_000,
  canonicalization_version: "drupal-issue-snapshot-jcs-v1",
  projection_schema_version: "1.0.0",
};

async function withRepository(
  response: Response,
  run: (root: string, dependencies: CollectorDependencies) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "openacr-collect-test-"));
  const responses = [response];
  const dependencies: CollectorDependencies = {
    fetch: async () => {
      const next = responses.shift();
      if (next === undefined) throw new Error("unexpected synthetic request");
      return next;
    },
    now: () => nowMs,
    random: () => 0,
    sleep: async () => undefined,
    setTimer: () => ({ synthetic: true }),
    clearTimer: () => undefined,
  };
  try {
    await writeFile(join(root, "pilot.json"), `${JSON.stringify(config, null, 2)}\n`);
    await run(root, dependencies);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("builds a complete local candidate from one synthetic response only", async () => {
  await withRepository(new Response(JSON.stringify(buildSyntheticPage())), async (root, dependencies) => {
    const result = await collectCandidate({
      repositoryRoot: root,
      configPath: join(root, "pilot.json"),
      candidateRoot: join(root, "var", "candidates"),
      runId: "synthetic-collect-success",
      dependencies,
    });

    assert.equal(result.status, "candidate");
    if (result.status !== "candidate") return;
    assert.equal(result.recordCount, 25);
    const provenance = await readFile(join(result.candidatePath, "provenance.md"), "utf8");
    assert.match(provenance, /not an accessibility evaluation or an ACR/iu);
    await assert.rejects(access(join(root, "snapshots")));
    assert.deepEqual(await readdir(join(root, "var", "tmp", "responses")), []);
  });
});

test("writes an unavailable receipt outside snapshots and creates no candidate on 429", async () => {
  await withRepository(
    new Response(null, { status: 429, headers: { "retry-after": "120" } }),
    async (root, dependencies) => {
      const result = await collectCandidate({
        repositoryRoot: root,
        configPath: join(root, "pilot.json"),
        candidateRoot: join(root, "var", "candidates"),
        runId: "synthetic-collect-429",
        dependencies,
      });

      assert.equal(result.status, "unavailable");
      if (result.status !== "unavailable") return;
      assert.match(
        result.provenancePath,
        /var\/receipts\/synthetic-collect-429\.provenance\.md$/u,
      );
      const receipt = JSON.parse(await readFile(result.receiptPath, "utf8")) as {
        observation_state: string;
        termination_reason: string;
      };
      assert.equal(receipt.observation_state, "unavailable");
      assert.equal(receipt.termination_reason, "retry_after_exceeds_maximum");
      const provenance = await readFile(result.provenancePath, "utf8");
      assert.match(provenance, /no candidate created/iu);
      assert.match(provenance, /Freshness: unavailable/u);
      assert.deepEqual(await readdir(join(root, "var", "candidates")), []);
    },
  );
});

test("rejects an unreviewed candidate root before filesystem creation or fetch", async () => {
  await withRepository(new Response(JSON.stringify(buildSyntheticPage())), async (root, dependencies) => {
    const outsideRoot = join(root, "outside-candidates");
    let fetchCalls = 0;
    const guardedDependencies: CollectorDependencies = {
      ...dependencies,
      fetch: async (url, init) => {
        fetchCalls += 1;
        return dependencies.fetch(url, init);
      },
    };

    await assert.rejects(
      collectCandidate({
        repositoryRoot: root,
        configPath: join(root, "pilot.json"),
        candidateRoot: outsideRoot,
        runId: "synthetic-invalid-candidate-root",
        dependencies: guardedDependencies,
      }),
      /candidate root/u,
    );
    assert.equal(fetchCalls, 0);
    await assert.rejects(access(outsideRoot));
  });
});

test("rejects a symlinked var boundary before creating through it or fetching", async () => {
  await withRepository(new Response(JSON.stringify(buildSyntheticPage())), async (root, dependencies) => {
    const outsideTarget = join(root, "outside-target");
    await mkdir(outsideTarget);
    await symlink(outsideTarget, join(root, "var"), "dir");
    let fetchCalls = 0;
    const guardedDependencies: CollectorDependencies = {
      ...dependencies,
      fetch: async (url, init) => {
        fetchCalls += 1;
        return dependencies.fetch(url, init);
      },
    };

    await assert.rejects(
      collectCandidate({
        repositoryRoot: root,
        configPath: join(root, "pilot.json"),
        candidateRoot: join(root, "var", "candidates"),
        runId: "synthetic-symlinked-candidate-root",
        dependencies: guardedDependencies,
      }),
      /not a real directory/u,
    );
    assert.equal(fetchCalls, 0);
    await assert.rejects(access(join(outsideTarget, "candidates")));
  });
});

test("rejects a symlinked temporary-response boundary before creating through it or fetching", async () => {
  await withRepository(new Response(JSON.stringify(buildSyntheticPage())), async (root, dependencies) => {
    const outsideTarget = join(root, "outside-temporary-target");
    await Promise.all([mkdir(join(root, "var")), mkdir(outsideTarget)]);
    await symlink(outsideTarget, join(root, "var", "tmp"), "dir");
    let fetchCalls = 0;
    const guardedDependencies: CollectorDependencies = {
      ...dependencies,
      fetch: async (url, init) => {
        fetchCalls += 1;
        return dependencies.fetch(url, init);
      },
    };

    await assert.rejects(
      collectCandidate({
        repositoryRoot: root,
        configPath: join(root, "pilot.json"),
        candidateRoot: join(root, "var", "candidates"),
        runId: "synthetic-symlinked-temporary-root",
        dependencies: guardedDependencies,
      }),
      /not a real directory/u,
    );
    assert.equal(fetchCalls, 0);
    await assert.rejects(access(join(outsideTarget, "responses")));
  });
});

test("rejects a symlinked receipt boundary before fetching", async () => {
  await withRepository(new Response(JSON.stringify(buildSyntheticPage())), async (root, dependencies) => {
    const outsideTarget = join(root, "outside-receipt-target");
    await Promise.all([mkdir(join(root, "var")), mkdir(outsideTarget)]);
    await symlink(outsideTarget, join(root, "var", "receipts"), "dir");
    let fetchCalls = 0;
    const guardedDependencies: CollectorDependencies = {
      ...dependencies,
      fetch: async (url, init) => {
        fetchCalls += 1;
        return dependencies.fetch(url, init);
      },
    };

    await assert.rejects(
      collectCandidate({
        repositoryRoot: root,
        configPath: join(root, "pilot.json"),
        candidateRoot: join(root, "var", "candidates"),
        runId: "synthetic-symlinked-receipt-root",
        dependencies: guardedDependencies,
      }),
      /not a real directory/u,
    );
    assert.equal(fetchCalls, 0);
    assert.deepEqual(await readdir(outsideTarget), []);
  });
});
