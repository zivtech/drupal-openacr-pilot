import { createHash } from "node:crypto";
import { lstat, readFile, readdir, rmdir, unlink } from "node:fs/promises";
import { join } from "node:path";

import type { DeletionEvidence } from "./response-representation.js";

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export async function sweepResponseRepresentations(
  temporaryRoot: string,
  deletedAt: string,
): Promise<readonly DeletionEvidence[]> {
  try {
    const rootStat = await lstat(temporaryRoot);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      throw new TypeError(`recovery root is not a real directory: ${temporaryRoot}`);
    }
  } catch (error) {
    if (isMissing(error)) return Object.freeze([]);
    throw error;
  }
  let entries;
  try {
    entries = await readdir(temporaryRoot, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) {
      return Object.freeze([]);
    }
    throw error;
  }

  const receipts: DeletionEvidence[] = [];
  for (const entry of entries) {
    if (!entry.name.startsWith("response-")) {
      continue;
    }
    const directory = join(temporaryRoot, entry.name);
    const directoryStat = await lstat(directory);
    if (!entry.isDirectory() || directoryStat.isSymbolicLink()) {
      throw new Error(`unsafe recovery entry: ${entry.name}`);
    }
    const children = await readdir(directory);
    if (children.some((child) => child !== "representation.bin")) {
      throw new Error(`unexpected recovery entry in ${entry.name}`);
    }

    const filePath = join(directory, "representation.bin");
    let bytes = new Uint8Array();
    let createdAt = deletedAt;
    let representationSha256: string | null = null;
    if (children.includes("representation.bin")) {
      const fileStat = await lstat(filePath);
      if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
        throw new Error(`recovery representation is not a regular file: ${entry.name}`);
      }
      bytes = new Uint8Array(await readFile(filePath));
      representationSha256 = createHash("sha256").update(bytes).digest("hex");
      createdAt = fileStat.birthtime.toISOString();
      await unlink(filePath);
    }
    await rmdir(directory);
    receipts.push(
      Object.freeze({
        representationCreatedAt: createdAt,
        deletedAt,
        method: "recovery_unlink" as const,
        verification: "path_absent" as const,
        representationSha256,
        representationBytes: bytes.byteLength,
        recovery: true,
      }),
    );
  }
  return Object.freeze(receipts);
}
