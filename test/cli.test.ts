import assert from "node:assert/strict";
import test from "node:test";

import { runCli, type CliDependencies } from "../src/cli.js";

test("accepts only reviewed config and candidate-root arguments", async () => {
  const calls: unknown[] = [];
  const output: string[] = [];
  const errors: string[] = [];
  const dependencies: CliDependencies = {
    collect: async (options) => {
      calls.push(options);
      return {
        status: "candidate",
        disposition: "created",
        snapshotId: "drupal11-issue-snapshot-0123456789abcdef",
        candidatePath: "/repo/var/candidates/drupal11-issue-snapshot-0123456789abcdef",
        recordCount: 1,
      };
    },
    stdout: (message) => output.push(message),
    stderr: (message) => errors.push(message),
    repositoryRoot: "/repo",
    createRunId: () => "synthetic-cli-run",
  };

  const code = await runCli(
    ["--config", "/repo/config/pilot.drupal11.json", "--candidate-root", "/repo/var/candidates"],
    dependencies,
  );

  assert.equal(code, 0);
  assert.equal(calls.length, 1);
  assert.match(output.join("\n"), /candidate/iu);
  assert.deepEqual(errors, []);
});

test("rejects arbitrary URL, publication, missing, and unknown options without collecting", async () => {
  for (const argv of [
    ["--url", "https://example.test/"],
    ["--publish"],
    ["--config", "/repo/config.json"],
    ["--unknown", "value"],
  ]) {
    let collected = false;
    const dependencies: CliDependencies = {
      collect: async () => {
        collected = true;
        throw new Error("must not collect");
      },
      stdout: () => undefined,
      stderr: () => undefined,
      repositoryRoot: "/repo",
      createRunId: () => "synthetic-cli-run",
    };
    assert.equal(await runCli(argv, dependencies), 2);
    assert.equal(collected, false);
  }
});

test("prints help without collecting", async () => {
  const output: string[] = [];
  const dependencies: CliDependencies = {
    collect: async () => {
      throw new Error("must not collect");
    },
    stdout: (message) => output.push(message),
    stderr: () => undefined,
    repositoryRoot: "/repo",
    createRunId: () => "synthetic-cli-run",
  };

  assert.equal(await runCli(["--help"], dependencies), 0);
  assert.match(output.join("\n"), /--config/u);
  assert.doesNotMatch(output.join("\n"), /--url|--publish/u);
});
