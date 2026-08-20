import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { collectCandidate, type CollectorDependencies } from "../src/collect.js";
import type { CandidateManifest, PilotConfig } from "../src/domain/types.js";
import { buildSyntheticPage, selectionUrl } from "./fixtures/selection/synthetic-pages.js";

const baseTimeMs = Date.parse("2026-08-18T13:09:16Z");
const freshnessWindowMs = 86_400_000;
const fixtureUrls = {
  outcome: new URL("../../test/fixtures/evaluation-invariance/outcome-map.json", import.meta.url),
  terms: new URL("../../test/fixtures/evaluation-invariance/acr-term-map.json", import.meta.url),
};
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
  freshness_window_ms: freshnessWindowMs,
  minimum_live_run_interval_ms: 3_600_000,
  canonicalization_version: "drupal-issue-snapshot-jcs-v1",
  projection_schema_version: "1.0.0",
};

interface InvarianceScenario {
  readonly name: string;
  readonly response: () => Response;
  readonly stale?: true;
  readonly expectedResult: "candidate" | "unavailable";
  readonly expectedFreshness?: "fresh" | "stale";
}

const scenarios: readonly InvarianceScenario[] = [
  {
    name: "429",
    response: () => new Response(null, { status: 429, headers: { "retry-after": "120" } }),
    expectedResult: "unavailable",
  },
  {
    name: "stale",
    response: () => new Response(JSON.stringify(buildSyntheticPage())),
    stale: true,
    expectedResult: "candidate",
    expectedFreshness: "stale",
  },
  {
    name: "unavailable",
    response: () => new Response(null, { status: 403 }),
    expectedResult: "unavailable",
  },
  {
    name: "changed issue status",
    response: () =>
      new Response(JSON.stringify(buildSyntheticPage({ recordOverrides: { field_issue_status: "2" } }))),
    expectedResult: "candidate",
    expectedFreshness: "fresh",
  },
  {
    name: "issue closure",
    response: () =>
      new Response(JSON.stringify(buildSyntheticPage({ recordOverrides: { field_issue_status: "7" } }))),
    expectedResult: "candidate",
    expectedFreshness: "fresh",
  },
];

function scenarioDependencies(scenario: InvarianceScenario): CollectorDependencies {
  let clockCalls = 0;
  let fetched = false;
  return {
    fetch: async () => {
      assert.equal(fetched, false, `${scenario.name} issued more than one synthetic request`);
      fetched = true;
      return scenario.response();
    },
    now: () => {
      const call = clockCalls;
      clockCalls += 1;
      return scenario.stale === true && call >= 7
        ? baseTimeMs + freshnessWindowMs
        : baseTimeMs;
    },
    random: () => 0,
    sleep: async () => undefined,
    setTimer: () => ({ synthetic: true }),
    clearTimer: () => undefined,
  };
}

for (const scenario of scenarios) {
  test(`${scenario.name} cannot modify fixed evaluation outcome or ACR-term bytes`, async () => {
    const root = await mkdtemp(join(tmpdir(), "openacr-invariance-test-"));
    try {
      const evidenceRoot = join(root, "evaluation-evidence");
      await mkdir(evidenceRoot);
      const beforeOutcome = await readFile(fixtureUrls.outcome);
      const beforeTerms = await readFile(fixtureUrls.terms);
      const outcomePath = join(evidenceRoot, "outcome-map.json");
      const termPath = join(evidenceRoot, "acr-term-map.json");
      await Promise.all([
        writeFile(join(root, "pilot.json"), `${JSON.stringify(config, null, 2)}\n`),
        writeFile(outcomePath, beforeOutcome),
        writeFile(termPath, beforeTerms),
      ]);

      const result = await collectCandidate({
        repositoryRoot: root,
        configPath: join(root, "pilot.json"),
        candidateRoot: join(root, "var", "candidates"),
        runId: `synthetic-invariance-${scenario.name.replaceAll(" ", "-")}`,
        dependencies: scenarioDependencies(scenario),
      });

      assert.equal(result.status, scenario.expectedResult);
      if (result.status === "candidate" && scenario.expectedFreshness !== undefined) {
        const manifest = JSON.parse(
          await readFile(join(result.candidatePath, "manifest.json"), "utf8"),
        ) as CandidateManifest;
        assert.equal(manifest.freshness, scenario.expectedFreshness);
      }
      assert.equal(Buffer.compare(await readFile(outcomePath), beforeOutcome), 0);
      assert.equal(Buffer.compare(await readFile(termPath), beforeTerms), 0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
