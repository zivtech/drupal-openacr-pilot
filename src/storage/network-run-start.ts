import { open, readFile, rename, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { NetworkRunStart, PilotConfig } from "../domain/types.js";
import { isValidEpochMilliseconds } from "../time/strict-utc.js";
import { validateNetworkRunStart } from "../validation/ajv.js";
import { ensureRealDirectory } from "./safe-directory.js";

export class NetworkRunLockError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "NetworkRunLockError";
  }
}

export class NetworkRunTooSoonError extends Error {
  public readonly nextEligibleAt: string;

  public constructor(nextEligibleAt: string) {
    super(`network run is blocked until ${nextEligibleAt}`);
    this.name = "NetworkRunTooSoonError";
    this.nextEligibleAt = nextEligibleAt;
  }
}

export class NetworkRunStateError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "NetworkRunStateError";
  }
}

export interface AdmitNetworkRunOptions {
  readonly repositoryRoot: string;
  readonly runId: string;
  readonly nowMs: number;
  readonly configDigest: string;
  readonly config: Pick<
    PilotConfig,
    "selection_url" | "user_agent" | "minimum_live_run_interval_ms"
  >;
}

function stateErrorMessage(errors: readonly { readonly instancePath: string; readonly message: string | undefined }[]): string {
  return errors.map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`).join("; ");
}

async function readPriorState(statePath: string): Promise<NetworkRunStart | null> {
  let text;
  try {
    text = await readFile(statePath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new NetworkRunStateError("network-run state is not valid JSON");
  }
  const validation = validateNetworkRunStart(parsed);
  if (!validation.ok) {
    throw new NetworkRunStateError(`network-run state is invalid: ${stateErrorMessage(validation.errors)}`);
  }
  return validation.value;
}

export async function admitNetworkRun(
  options: AdmitNetworkRunOptions,
): Promise<NetworkRunStart> {
  if (!/^[A-Za-z0-9._-]+$/u.test(options.runId)) {
    throw new TypeError("run ID contains unsafe path characters");
  }
  if (!isValidEpochMilliseconds(options.nowMs)) {
    throw new RangeError("network-run clock must be a valid integer epoch-millisecond value");
  }
  const nextEligibleMs = options.nowMs + options.config.minimum_live_run_interval_ms;
  if (!isValidEpochMilliseconds(nextEligibleMs)) {
    throw new RangeError("next eligible time must be a valid integer epoch-millisecond value");
  }
  const varDirectory = resolve(options.repositoryRoot, "var");
  const stateDirectory = resolve(varDirectory, "state");
  await ensureRealDirectory(varDirectory);
  await ensureRealDirectory(stateDirectory);
  const lockPath = join(stateDirectory, "drupal11-network-run.lock");
  const statePath = join(stateDirectory, "drupal11-network-run.json");
  const temporaryPath = join(stateDirectory, `drupal11-network-run.${options.runId}.tmp`);
  let lockHandle;
  try {
    lockHandle = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw new NetworkRunLockError(`network-run lock already exists: ${lockPath}`);
    }
    throw error;
  }

  try {
    await lockHandle.writeFile(`${options.runId}\n`, "utf8");
    await lockHandle.sync();
    const prior = await readPriorState(statePath);
    if (prior !== null) {
      const nextEligibleMs = Date.parse(prior.next_eligible_at);
      if (!Number.isFinite(nextEligibleMs)) {
        throw new NetworkRunStateError("prior next_eligible_at is not a valid UTC instant");
      }
      if (options.nowMs < nextEligibleMs) {
        throw new NetworkRunTooSoonError(prior.next_eligible_at);
      }
    }

    const state: NetworkRunStart = Object.freeze({
      schema_version: "1.0.0",
      run_id: options.runId,
      started_at: new Date(options.nowMs).toISOString(),
      next_eligible_at: new Date(nextEligibleMs).toISOString(),
      selection_url: options.config.selection_url,
      user_agent: options.config.user_agent,
      config_digest: options.configDigest,
      minimum_live_run_interval_ms: options.config.minimum_live_run_interval_ms,
    });
    const validation = validateNetworkRunStart(state);
    if (!validation.ok) {
      throw new NetworkRunStateError(`new network-run state is invalid: ${stateErrorMessage(validation.errors)}`);
    }

    const temporaryHandle = await open(temporaryPath, "wx", 0o600);
    try {
      await temporaryHandle.writeFile(`${JSON.stringify(state, null, 2)}\n`, "utf8");
      await temporaryHandle.sync();
    } finally {
      await temporaryHandle.close();
    }
    await rename(temporaryPath, statePath);
    return state;
  } finally {
    await lockHandle.close();
    await unlink(lockPath);
  }
}
