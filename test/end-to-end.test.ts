import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { collectCandidate, type CollectorDependencies } from "../src/collect.js";
import type { CandidateManifest, PilotConfig } from "../src/domain/types.js";
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

function dependenciesFor(response: Response): CollectorDependencies {
  let used = false;
  return {
    fetch: async () => {
      assert.equal(used, false, "the fixture-only end-to-end run must make one synthetic request");
      used = true;
      return response;
    },
    now: () => nowMs,
    random: () => 0,
    sleep: async () => undefined,
    setTimer: () => ({ synthetic: true }),
    clearTimer: () => undefined,
  };
}

async function createRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "openacr-e2e-test-"));
  await writeFile(join(root, "pilot.json"), `${JSON.stringify(config, null, 2)}\n`);
  return root;
}

test("creates only the complete immutable candidate bundle from a synthetic page", async () => {
  const root = await createRepository();
  try {
    const result = await collectCandidate({
      repositoryRoot: root,
      configPath: join(root, "pilot.json"),
      candidateRoot: join(root, "var", "candidates"),
      runId: "synthetic-e2e-complete",
      dependencies: dependenciesFor(new Response(JSON.stringify(buildSyntheticPage()))),
    });

    assert.equal(result.status, "candidate");
    if (result.status !== "candidate") return;
    assert.deepEqual(await readdir(result.candidatePath), [
      "deletion-receipt.json",
      "manifest.json",
      "provenance.md",
      "receipt.json",
      "records",
    ]);
    const manifest = JSON.parse(
      await readFile(join(result.candidatePath, "manifest.json"), "utf8"),
    ) as CandidateManifest;
    assert.equal(manifest.record_count, 25);
    assert.equal(manifest.freshness, "fresh");
    assert.deepEqual(
      manifest.ordered_records.map((record) => record.issue_id),
      Array.from({ length: 25 }, (_, index) => 3_500_025 - index),
    );
    const recordFiles = await readdir(join(result.candidatePath, "records"));
    assert.equal(recordFiles.length, 25);
    const candidateText = await Promise.all(
      recordFiles.map((file) => readFile(join(result.candidatePath, "records", file), "utf8")),
    );
    assert.doesNotMatch(candidateText.join("\n"), /Excluded synthetic narrative|excluded@example\.test/u);
    await assert.rejects(access(join(root, "snapshots")));
    await assert.rejects(access(join(root, "acr")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("isolates an incomplete synthetic selection as unavailable without a candidate", async () => {
  const root = await createRepository();
  try {
    const shortPage = buildSyntheticPage({ ids: [3_500_025], next: `${selectionUrl.slice(0, -1)}1` });
    const result = await collectCandidate({
      repositoryRoot: root,
      configPath: join(root, "pilot.json"),
      candidateRoot: join(root, "var", "candidates"),
      runId: "synthetic-e2e-incomplete",
      dependencies: dependenciesFor(new Response(JSON.stringify(shortPage))),
    });

    assert.equal(result.status, "unavailable");
    if (result.status !== "unavailable") return;
    assert.equal(result.terminationReason, "short_page_with_next");
    assert.deepEqual(await readdir(join(root, "var", "candidates")), []);
    const receipt = await readFile(result.receiptPath, "utf8");
    assert.match(receipt, /"observation_state": "unavailable"/u);
    assert.doesNotMatch(receipt, /"termination_reason": "complete"/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("removes a recognized crash remnant and records recovery before synthetic fetch", async () => {
  const root = await createRepository();
  try {
    const remnant = join(root, "var", "tmp", "responses", "response-prior-crash-ABC123");
    const representationPath = join(remnant, "representation.bin");
    await mkdir(remnant, { recursive: true });
    await writeFile(representationPath, "prior synthetic response bytes");
    let fetchCalls = 0;
    const dependencies: CollectorDependencies = {
      ...dependenciesFor(new Response(JSON.stringify(buildSyntheticPage()))),
      fetch: async () => {
        fetchCalls += 1;
        await assert.rejects(access(representationPath));
        return new Response(JSON.stringify(buildSyntheticPage()));
      },
    };

    const result = await collectCandidate({
      repositoryRoot: root,
      configPath: join(root, "pilot.json"),
      candidateRoot: join(root, "var", "candidates"),
      runId: "synthetic-e2e-recovery",
      dependencies,
    });

    assert.equal(result.status, "candidate");
    assert.equal(fetchCalls, 1);
    const recovery = JSON.parse(
      await readFile(join(root, "var", "receipts", "synthetic-e2e-recovery.recovery.json"), "utf8"),
    ) as {
      recovery_run_id: string;
      recovered_representations: readonly {
        representation_bytes: number;
        recovery: boolean;
      }[];
    };
    assert.equal(recovery.recovery_run_id, "synthetic-e2e-recovery");
    assert.equal(recovery.recovered_representations.length, 1);
    assert.equal(recovery.recovered_representations[0]?.representation_bytes, 30);
    assert.equal(recovery.recovered_representations[0]?.recovery, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
