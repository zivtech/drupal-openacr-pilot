import { createHash } from "node:crypto";
import {
  access,
  mkdtemp,
  open,
  readFile,
  rmdir,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import { join } from "node:path";

import { ensureRealDirectory } from "./safe-directory.js";

export class ResponseRepresentationCaptureError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ResponseRepresentationCaptureError";
  }
}

export interface CaptureOptions {
  readonly body: ReadableStream<Uint8Array>;
  readonly temporaryRoot: string;
  readonly runId: string;
  readonly maximumBytes: number;
  readonly createdAt: string;
}

export interface DeletionEvidence {
  readonly representationCreatedAt: string;
  readonly deletedAt: string;
  readonly method: "unlink" | "recovery_unlink";
  readonly verification: "path_absent";
  readonly representationSha256: string;
  readonly representationBytes: number;
  readonly recovery: boolean;
}

export interface ResponseRepresentationCapture {
  readonly filePath: string;
  readonly representationBytes: number;
  readonly sha256: string;
  readonly createdAt: string;
  readBytes(): Promise<Uint8Array>;
  cleanup(deletedAt: string): Promise<DeletionEvidence>;
}

function safeRunId(runId: string): string {
  if (!/^[A-Za-z0-9._-]+$/u.test(runId)) {
    throw new TypeError("run ID contains unsafe path characters");
  }
  return runId;
}

async function removeCaptureFile(filePath: string, directory: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
  await rmdir(directory);
}

export async function captureResponseRepresentation(
  options: CaptureOptions,
): Promise<ResponseRepresentationCapture> {
  if (!Number.isSafeInteger(options.maximumBytes) || options.maximumBytes < 0) {
    throw new RangeError("maximum response bytes must be a non-negative safe integer");
  }
  await ensureRealDirectory(options.temporaryRoot);
  const directory = await mkdtemp(join(options.temporaryRoot, `response-${safeRunId(options.runId)}-`));
  const filePath = join(directory, "representation.bin");
  let handle: FileHandle | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const hash = createHash("sha256");
  let representationBytes = 0;

  try {
    handle = await open(filePath, "wx", 0o600);
    reader = options.body.getReader();
    while (true) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      const chunk = result.value;
      representationBytes += chunk.byteLength;
      if (representationBytes > options.maximumBytes) {
        throw new ResponseRepresentationCaptureError(
          `decoded response representation exceeds ${options.maximumBytes} bytes`,
        );
      }
      hash.update(chunk);
      await handle.write(chunk);
    }
    await handle.sync();
    await handle.close();
    handle = undefined;
  } catch (error) {
    await reader?.cancel().catch(() => undefined);
    await handle?.close().catch(() => undefined);
    await removeCaptureFile(filePath, directory);
    throw error;
  } finally {
    reader?.releaseLock();
  }

  const sha256 = hash.digest("hex");
  let cleaned = false;
  return Object.freeze({
    filePath,
    representationBytes,
    sha256,
    createdAt: options.createdAt,
    async readBytes(): Promise<Uint8Array> {
      return new Uint8Array(await readFile(filePath));
    },
    async cleanup(deletedAt: string): Promise<DeletionEvidence> {
      if (cleaned) {
        throw new Error("response representation was already cleaned up");
      }
      await removeCaptureFile(filePath, directory);
      await access(filePath).then(
        () => {
          throw new Error("response representation still exists after cleanup");
        },
        () => undefined,
      );
      cleaned = true;
      return Object.freeze({
        representationCreatedAt: options.createdAt,
        deletedAt,
        method: "unlink",
        verification: "path_absent",
        representationSha256: sha256,
        representationBytes,
        recovery: false,
      });
    },
  });
}
