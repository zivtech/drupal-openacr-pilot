import type { SelectionReceipt } from "../domain/types.js";
import { hashCanonicalJson, type CanonicalJsonHash } from "../integrity/hash.js";
import { validateReceipt } from "../validation/ajv.js";

export type SelectionReceiptPayload = Omit<SelectionReceipt, "selection_receipt_sha256">;

function validationMessage(
  errors: readonly { readonly instancePath: string; readonly message: string | undefined }[],
): string {
  return errors.map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`).join("; ");
}

export function selectionReceiptPayload(receipt: SelectionReceipt): SelectionReceiptPayload {
  return Object.freeze({
    schema_version: receipt.schema_version,
    config_digest: receipt.config_digest,
    requested_url: receipt.requested_url,
    final_url: receipt.final_url,
    user_agent: receipt.user_agent,
    fetched_at: receipt.fetched_at,
    observation_state: receipt.observation_state,
    http: Object.freeze({ ...receipt.http }),
    attempts: Object.freeze(receipt.attempts.map((attempt) => Object.freeze({ ...attempt }))),
    pagination: Object.freeze({ ...receipt.pagination }),
    ordered_ids: Object.freeze([...receipt.ordered_ids]),
    page_representation_sha256: receipt.page_representation_sha256,
    termination_reason: receipt.termination_reason,
  });
}

export function hashSelectionReceiptPayload(payload: SelectionReceiptPayload): CanonicalJsonHash {
  return hashCanonicalJson(payload);
}

export function buildSelectionReceipt(value: unknown): SelectionReceipt {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("receipt payload is invalid: expected an object");
  }
  if ("selection_receipt_sha256" in value) {
    throw new TypeError("receipt payload must not provide its own hash");
  }
  const candidate = {
    ...(value as Record<string, unknown>),
    selection_receipt_sha256: "0".repeat(64),
  };
  const candidateValidation = validateReceipt(candidate);
  if (!candidateValidation.ok) {
    throw new TypeError(`receipt payload is invalid: ${validationMessage(candidateValidation.errors)}`);
  }
  const payload = selectionReceiptPayload(candidateValidation.value);
  const receipt: SelectionReceipt = Object.freeze({
    ...payload,
    selection_receipt_sha256: hashSelectionReceiptPayload(payload).sha256,
  });
  const validation = validateReceipt(receipt);
  if (!validation.ok) {
    throw new TypeError(`built receipt is invalid: ${validationMessage(validation.errors)}`);
  }
  return receipt;
}
