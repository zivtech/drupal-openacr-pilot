import type { ObservationState } from "../domain/types.js";

export type ResourceKind = "selection" | "individual_issue";

export interface HttpClassification {
  readonly observationState: ObservationState;
  readonly retryable: boolean;
  readonly reason: string;
}

export function classifyHttpStatus(status: number, resourceKind: ResourceKind): HttpClassification {
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    throw new RangeError(`invalid HTTP status: ${status}`);
  }
  if (status >= 200 && status <= 299) {
    return Object.freeze({ observationState: "retrieved", retryable: false, reason: "success" });
  }
  if ((status === 404 || status === 410) && resourceKind === "individual_issue") {
    return Object.freeze({
      observationState: "resource_gone",
      retryable: false,
      reason: "canonical_resource_gone",
    });
  }
  if (status === 401 || status === 403) {
    return Object.freeze({
      observationState: "unavailable",
      retryable: false,
      reason: "permission_unavailable",
    });
  }
  if (status === 429) {
    return Object.freeze({
      observationState: "unavailable",
      retryable: true,
      reason: "rate_limited",
    });
  }
  if (status >= 500) {
    return Object.freeze({
      observationState: "unavailable",
      retryable: true,
      reason: "server_unavailable",
    });
  }
  return Object.freeze({
    observationState: "unavailable",
    retryable: false,
    reason: status === 404 || status === 410 ? "selection_endpoint_unavailable" : "http_unavailable",
  });
}

export interface TransportClassification {
  readonly observationState: "unavailable";
  readonly reason: "timeout" | "tls" | "dns" | "aborted" | "transport_error";
}

export function classifyTransportError(error: unknown): TransportClassification {
  const name = error instanceof Error ? error.name : "";
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { readonly code: unknown }).code)
      : "";
  if (name === "TimeoutError") {
    return Object.freeze({ observationState: "unavailable", reason: "timeout" });
  }
  if (name === "AbortError") {
    return Object.freeze({ observationState: "unavailable", reason: "aborted" });
  }
  if (/CERT|TLS|SSL/u.test(code)) {
    return Object.freeze({ observationState: "unavailable", reason: "tls" });
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return Object.freeze({ observationState: "unavailable", reason: "dns" });
  }
  return Object.freeze({ observationState: "unavailable", reason: "transport_error" });
}
