import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  admitNetworkRun,
  NetworkRunLockError,
  NetworkRunTooSoonError,
} from "../../src/storage/network-run-start.js";
import type { PilotConfig } from "../../src/domain/types.js";
import { selectionUrl } from "../fixtures/selection/synthetic-pages.js";

const config = {
  selection_url: selectionUrl,
  user_agent: "Zivtech-Drupal-OpenACR-Pilot/0.1 (+https://github.com/zivtech/drupal-openacr-pilot)",
  minimum_live_run_interval_ms: 3_600_000,
} as PilotConfig;
const digest = "a".repeat(64);
const startMs = Date.parse("2026-08-18T13:09:16Z");

async function withRepository(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "openacr-run-state-test-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("atomically persists a valid run start before network eligibility", async () => {
  await withRepository(async (root) => {
    const admitted = await admitNetworkRun({
      repositoryRoot: root,
      runId: "synthetic-run-1",
      nowMs: startMs,
      configDigest: digest,
      config,
    });
    const stored = JSON.parse(
      await readFile(join(root, "var", "state", "drupal11-network-run.json"), "utf8"),
    ) as unknown;

    assert.deepEqual(stored, admitted);
    assert.equal(admitted.next_eligible_at, "2026-08-18T14:09:16.000Z");
  });
});

test("blocks a later run for one hour regardless of prior success state", async () => {
  await withRepository(async (root) => {
    await admitNetworkRun({
      repositoryRoot: root,
      runId: "synthetic-run-1",
      nowMs: startMs,
      configDigest: digest,
      config,
    });

    await assert.rejects(
      admitNetworkRun({
        repositoryRoot: root,
        runId: "synthetic-run-2",
        nowMs: startMs + 3_599_999,
        configDigest: digest,
        config,
      }),
      NetworkRunTooSoonError,
    );
    const next = await admitNetworkRun({
      repositoryRoot: root,
      runId: "synthetic-run-3",
      nowMs: startMs + 3_600_000,
      configDigest: digest,
      config,
    });
    assert.equal(next.run_id, "synthetic-run-3");
  });
});

test("fails before persistence when the exclusive lock already exists", async () => {
  await withRepository(async (root) => {
    const stateDirectory = join(root, "var", "state");
    await mkdir(stateDirectory, { recursive: true });
    await writeFile(join(stateDirectory, "drupal11-network-run.lock"), "held");

    await assert.rejects(
      admitNetworkRun({
        repositoryRoot: root,
        runId: "synthetic-run-1",
        nowMs: startMs,
        configDigest: digest,
        config,
      }),
      NetworkRunLockError,
    );
  });
});

test("admits at most one of two concurrent starts", async () => {
  await withRepository(async (root) => {
    const attempts = ["synthetic-run-1", "synthetic-run-2"].map((runId) =>
      admitNetworkRun({
        repositoryRoot: root,
        runId,
        nowMs: startMs,
        configDigest: digest,
        config,
      }),
    );
    const results = await Promise.allSettled(attempts);

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  });
});

test("rejects unsafe run IDs before deriving any state path", async () => {
  await withRepository(async (root) => {
    await assert.rejects(
      admitNetworkRun({
        repositoryRoot: root,
        runId: "../outside",
        nowMs: startMs,
        configDigest: digest,
        config,
      }),
      /unsafe path characters/u,
    );
  });
});

test("rejects a fractional epoch-millisecond clock before creating state", async () => {
  await withRepository(async (root) => {
    await assert.rejects(
      admitNetworkRun({
        repositoryRoot: root,
        runId: "synthetic-run-fractional-clock",
        nowMs: startMs + 0.5,
        configDigest: digest,
        config,
      }),
      /network-run clock/u,
    );
    await assert.rejects(access(join(root, "var", "state")));
  });
});

test("rejects a symlinked state directory without writing through it", async () => {
  await withRepository(async (root) => {
    const outsideTarget = join(root, "outside-state-target");
    await Promise.all([mkdir(join(root, "var")), mkdir(outsideTarget)]);
    await symlink(outsideTarget, join(root, "var", "state"), "dir");

    await assert.rejects(
      admitNetworkRun({
        repositoryRoot: root,
        runId: "synthetic-run-symlink",
        nowMs: startMs,
        configDigest: digest,
        config,
      }),
      /not a real directory/u,
    );
    await assert.rejects(access(join(outsideTarget, "drupal11-network-run.json")));
  });
});
