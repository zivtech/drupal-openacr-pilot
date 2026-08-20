import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";

import type {
  CandidateManifest,
  DeletionReceipt,
  DrupalPage,
  NetworkRunStart,
  PilotConfig,
  RetainedRecord,
  SelectionReceipt,
  ValidationIssue,
  ValidationResult,
} from "../domain/types.js";
import { isStrictUtcTimestamp } from "../time/strict-utc.js";
import { isStrictHttpsUrl } from "./formats.js";

export type { ValidationIssue, ValidationResult } from "../domain/types.js";

const schemaFiles = {
  config: "config.schema.json",
  drupalPage: "drupal-page.schema.json",
  record: "record.schema.json",
  receipt: "receipt.schema.json",
  manifest: "manifest.schema.json",
  deletionReceipt: "deletion-receipt.schema.json",
  networkRunStart: "network-run-start.schema.json",
} as const;

function loadSchema(fileName: string): object {
  const schemaPath = join(process.cwd(), "schemas", fileName);
  return JSON.parse(readFileSync(schemaPath, "utf8")) as object;
}

function copyError(error: ErrorObject): ValidationIssue {
  return Object.freeze({
    instancePath: error.instancePath,
    schemaPath: error.schemaPath,
    keyword: error.keyword,
    params: Object.freeze({ ...error.params }) as Readonly<Record<string, unknown>>,
    message: error.message,
  });
}

function validateWith<T>(validator: ValidateFunction<T>, value: unknown): ValidationResult<T> {
  if (validator(value)) {
    return Object.freeze({ ok: true, value });
  }

  const errors = Object.freeze((validator.errors ?? []).map(copyError));
  return Object.freeze({ ok: false, errors });
}

const ajv = new Ajv2020({
  allErrors: true,
  allowUnionTypes: false,
  coerceTypes: false,
  removeAdditional: false,
  strict: true,
  useDefaults: false,
  validateFormats: true,
});
ajv.addFormat("strict-utc-timestamp", {
  type: "string",
  validate: isStrictUtcTimestamp,
});
ajv.addFormat("strict-https-url", {
  type: "string",
  validate: isStrictHttpsUrl,
});

const configValidator = ajv.compile<PilotConfig>(loadSchema(schemaFiles.config));
const drupalPageValidator = ajv.compile<DrupalPage>(loadSchema(schemaFiles.drupalPage));
const recordValidator = ajv.compile<RetainedRecord>(loadSchema(schemaFiles.record));
const receiptValidator = ajv.compile<SelectionReceipt>(loadSchema(schemaFiles.receipt));
const manifestValidator = ajv.compile<CandidateManifest>(loadSchema(schemaFiles.manifest));
const deletionReceiptValidator = ajv.compile<DeletionReceipt>(
  loadSchema(schemaFiles.deletionReceipt),
);
const networkRunStartValidator = ajv.compile<NetworkRunStart>(
  loadSchema(schemaFiles.networkRunStart),
);

export function validateConfig(value: unknown): ValidationResult<PilotConfig> {
  return validateWith(configValidator, value);
}

export function validateDrupalPage(value: unknown): ValidationResult<DrupalPage> {
  return validateWith(drupalPageValidator, value);
}

export function validateRecord(value: unknown): ValidationResult<RetainedRecord> {
  return validateWith(recordValidator, value);
}

export function validateReceipt(value: unknown): ValidationResult<SelectionReceipt> {
  return validateWith(receiptValidator, value);
}

export function validateManifest(value: unknown): ValidationResult<CandidateManifest> {
  return validateWith(manifestValidator, value);
}

export function validateDeletionReceipt(value: unknown): ValidationResult<DeletionReceipt> {
  return validateWith(deletionReceiptValidator, value);
}

export function validateNetworkRunStart(value: unknown): ValidationResult<NetworkRunStart> {
  return validateWith(networkRunStartValidator, value);
}
