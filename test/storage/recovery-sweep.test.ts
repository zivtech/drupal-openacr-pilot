import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { sweepResponseRepresentations } from "../../src/storage/recovery-sweep.js";

test("removes only recognized crash remnants and preserves unrelated entries", async () => {
  const root = await mkdtemp(join(tmpdir(), "openacr-recovery-test-"));
  try {
    const remnant = join(root, "response-synthetic-run-abc123");
    await mkdir(remnant);
    await writeFile(join(remnant, "representation.bin"), "synthetic bytes");
    await writeFile(join(root, "unrelated.txt"), "keep");

    const receipts = await sweepResponseRepresentations(root, "2026-08-18T13:09:16Z");

    assert.equal(receipts.length, 1);
    assert.equal(receipts[0]?.method, "recovery_unlink");
    assert.deepEqual(await readdir(root), ["unrelated.txt"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fails closed when a recognized remnant contains unexpected files", async () => {
  const root = await mkdtemp(join(tmpdir(), "openacr-recovery-test-"));
  try {
    const remnant = join(root, "response-synthetic-run-abc123");
    await mkdir(remnant);
    await writeFile(join(remnant, "unexpected.txt"), "do not delete broadly");

    await assert.rejects(
      sweepResponseRepresentations(root, "2026-08-18T13:09:16Z"),
      /unexpected recovery entry/u,
    );
    assert.deepEqual(await readdir(remnant), ["unexpected.txt"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a symlinked recovery root and a symlinked representation", async () => {
  const root = await mkdtemp(join(tmpdir(), "openacr-recovery-test-"));
  try {
    const outsideRoot = join(root, "outside");
    const linkedRoot = join(root, "linked-responses");
    await mkdir(outsideRoot);
    await symlink(outsideRoot, linkedRoot, "dir");
    await assert.rejects(
      sweepResponseRepresentations(linkedRoot, "2026-08-18T13:09:16Z"),
      /not a real directory/u,
    );

    const remnant = join(outsideRoot, "response-synthetic-run-abc123");
    const protectedFile = join(root, "protected.txt");
    await mkdir(remnant);
    await writeFile(protectedFile, "do not read as response evidence");
    await symlink(protectedFile, join(remnant, "representation.bin"));
    await assert.rejects(
      sweepResponseRepresentations(outsideRoot, "2026-08-18T13:09:16Z"),
      /not a regular file/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
