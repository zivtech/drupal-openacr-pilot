import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  captureResponseRepresentation,
  ResponseRepresentationCaptureError,
} from "../../src/storage/response-representation.js";

async function withTemporaryRoot(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "openacr-response-test-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("streams, hashes, reads, and explicitly deletes decoded representation bytes", async () => {
  await withTemporaryRoot(async (root) => {
    const response = new Response("abc");
    assert.ok(response.body);

    const capture = await captureResponseRepresentation({
      body: response.body,
      temporaryRoot: root,
      runId: "synthetic-run-1",
      maximumBytes: 3,
      createdAt: "2026-08-18T13:09:14Z",
    });

    assert.equal(capture.representationBytes, 3);
    assert.equal(
      capture.sha256,
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    assert.equal(new TextDecoder().decode(await capture.readBytes()), "abc");
    const deletion = await capture.cleanup("2026-08-18T13:09:16Z");
    assert.equal(deletion.verification, "path_absent");
    await assert.rejects(access(capture.filePath));
    assert.deepEqual(await readdir(root), []);
  });
});

test("removes partial bytes when the decoded representation exceeds the cap", async () => {
  await withTemporaryRoot(async (root) => {
    const response = new Response("abcd");
    assert.ok(response.body);

    await assert.rejects(
      captureResponseRepresentation({
        body: response.body,
        temporaryRoot: root,
        runId: "synthetic-run-2",
        maximumBytes: 3,
        createdAt: "2026-08-18T13:09:14Z",
      }),
      ResponseRepresentationCaptureError,
    );
    assert.deepEqual(await readdir(root), []);
  });
});

test("removes partial bytes when the response stream errors", async () => {
  await withTemporaryRoot(async (root) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("partial"));
        controller.error(new Error("synthetic stream failure"));
      },
    });

    await assert.rejects(
      captureResponseRepresentation({
        body,
        temporaryRoot: root,
        runId: "synthetic-run-3",
        maximumBytes: 100,
        createdAt: "2026-08-18T13:09:14Z",
      }),
      /synthetic stream failure/u,
    );
    assert.deepEqual(await readdir(root), []);
  });
});

test("removes its empty work directory when reader acquisition fails", async () => {
  await withTemporaryRoot(async (root) => {
    const body = new ReadableStream<Uint8Array>();
    Object.defineProperty(body, "getReader", {
      value: () => {
        throw new Error("synthetic reader acquisition failure");
      },
    });

    await assert.rejects(
      captureResponseRepresentation({
        body,
        temporaryRoot: root,
        runId: "synthetic-run-4",
        maximumBytes: 100,
        createdAt: "2026-08-18T13:09:14Z",
      }),
      /synthetic reader acquisition failure/u,
    );
    assert.deepEqual(await readdir(root), []);
  });
});

test("rejects a symlinked temporary root without creating through it", async () => {
  await withTemporaryRoot(async (root) => {
    const outsideTarget = join(root, "outside");
    const linkedRoot = join(root, "linked");
    await mkdir(outsideTarget);
    await symlink(outsideTarget, linkedRoot, "dir");
    const response = new Response("abc");
    assert.ok(response.body);

    await assert.rejects(
      captureResponseRepresentation({
        body: response.body,
        temporaryRoot: linkedRoot,
        runId: "synthetic-run-symlink",
        maximumBytes: 3,
        createdAt: "2026-08-18T13:09:14Z",
      }),
      /not a real directory/u,
    );
    assert.deepEqual(await readdir(outsideTarget), []);
  });
});
