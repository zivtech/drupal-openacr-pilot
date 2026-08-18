import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import {
  collectCandidate,
  type CollectCandidateOptions,
  type CollectCandidateResult,
  type CollectorDependencies,
} from "./collect.js";

export interface CliDependencies {
  readonly collect: (options: CollectCandidateOptions) => Promise<CollectCandidateResult>;
  readonly stdout: (message: string) => void;
  readonly stderr: (message: string) => void;
  readonly repositoryRoot: string;
  readonly createRunId: () => string;
  readonly collectorDependencies?: CollectorDependencies;
}

const help = `Usage: drupal-openacr-collect --config <reviewed-config.json> --candidate-root <var/candidates>

Creates a local candidate bundle only. It has no arbitrary source, promotion, evaluation, ACR, import, signing, or publication option.`;

function parseArguments(argv: readonly string[]):
  | { readonly help: true }
  | { readonly help: false; readonly configPath: string; readonly candidateRoot: string }
  | null {
  if (argv.length === 1 && argv[0] === "--help") return Object.freeze({ help: true });
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (
      (key !== "--config" && key !== "--candidate-root") ||
      value === undefined ||
      value.startsWith("--") ||
      values.has(key)
    ) {
      return null;
    }
    values.set(key, value);
  }
  if (values.size !== 2) return null;
  const configPath = values.get("--config");
  const candidateRoot = values.get("--candidate-root");
  return configPath === undefined || candidateRoot === undefined
    ? null
    : Object.freeze({ help: false, configPath, candidateRoot });
}

function defaultCollectorDependencies(): CollectorDependencies {
  const dependencies: CollectorDependencies = {
    fetch: (url: string, init: RequestInit) => globalThis.fetch(url, init),
    now: () => Date.now(),
    random: () => Math.random(),
    sleep: (milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
    setTimer: (callback: () => void, milliseconds: number) =>
      setTimeout(callback, milliseconds),
    clearTimer: (handle: unknown) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  return Object.freeze(dependencies);
}

export async function runCli(
  argv: readonly string[],
  dependencies: CliDependencies,
): Promise<number> {
  const parsed = parseArguments(argv);
  if (parsed === null) {
    dependencies.stderr(help);
    return 2;
  }
  if (parsed.help) {
    dependencies.stdout(help);
    return 0;
  }
  try {
    const result = await dependencies.collect({
      repositoryRoot: dependencies.repositoryRoot,
      configPath: parsed.configPath,
      candidateRoot: parsed.candidateRoot,
      runId: dependencies.createRunId(),
      dependencies: dependencies.collectorDependencies ?? defaultCollectorDependencies(),
    });
    dependencies.stdout(JSON.stringify(result));
    return result.status === "candidate" ? 0 : 1;
  } catch (error) {
    dependencies.stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

async function main(): Promise<void> {
  const code = await runCli(process.argv.slice(2), {
    collect: collectCandidate,
    stdout: (message) => process.stdout.write(`${message}\n`),
    stderr: (message) => process.stderr.write(`${message}\n`),
    repositoryRoot: process.cwd(),
    createRunId: () => randomUUID(),
  });
  process.exitCode = code;
}

const entryPath = process.argv[1];
if (entryPath !== undefined && import.meta.url === pathToFileURL(entryPath).href) {
  await main();
}
