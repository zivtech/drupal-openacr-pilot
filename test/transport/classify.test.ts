import assert from "node:assert/strict";
import test from "node:test";

import { classifyHttpStatus, classifyTransportError } from "../../src/transport/classify.js";

test("classifies permission, throttle, server, and success states fail-closed", () => {
  assert.deepEqual(classifyHttpStatus(200, "selection"), {
    observationState: "retrieved",
    retryable: false,
    reason: "success",
  });
  assert.equal(classifyHttpStatus(403, "selection").observationState, "unavailable");
  assert.equal(classifyHttpStatus(403, "selection").retryable, false);
  assert.equal(classifyHttpStatus(429, "selection").retryable, true);
  assert.equal(classifyHttpStatus(503, "selection").retryable, true);
});

test("never tombstones a selection endpoint and tombstones only individual 404 or 410", () => {
  assert.equal(classifyHttpStatus(404, "selection").observationState, "unavailable");
  assert.equal(classifyHttpStatus(410, "selection").observationState, "unavailable");
  assert.equal(classifyHttpStatus(404, "individual_issue").observationState, "resource_gone");
  assert.equal(classifyHttpStatus(410, "individual_issue").observationState, "resource_gone");
  assert.equal(classifyHttpStatus(403, "individual_issue").observationState, "unavailable");
});

test("classifies timeout, TLS, DNS, abort, and unknown transport errors as unavailable", () => {
  for (const error of [
    Object.assign(new Error("timeout"), { name: "TimeoutError" }),
    Object.assign(new Error("certificate"), { code: "CERT_HAS_EXPIRED" }),
    Object.assign(new Error("dns"), { code: "ENOTFOUND" }),
    Object.assign(new Error("abort"), { name: "AbortError" }),
    new Error("unknown"),
  ]) {
    assert.equal(classifyTransportError(error).observationState, "unavailable");
  }
});
