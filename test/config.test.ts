import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { validateConfig } from "../src/validation/ajv.js";

async function loadReviewedConfig(): Promise<Record<string, unknown>> {
  const path = join(process.cwd(), "config", "pilot.drupal11.json");
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

function assertInvalid(result: ReturnType<typeof validateConfig>, keyword: string): void {
  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.ok(
    result.errors.some((error) => error.keyword === keyword),
    `expected ${keyword} error, got ${JSON.stringify(result.errors)}`,
  );
}

test("accepts the exact reviewed fixture-only pilot configuration", async () => {
  const config = await loadReviewedConfig();
  const result = validateConfig(config);

  assert.equal(result.ok, true);
  assert.deepEqual(config, await loadReviewedConfig());
});

test("rejects a missing required configuration value without inserting a default", async () => {
  const config = await loadReviewedConfig();
  delete config.user_agent;

  const result = validateConfig(config);

  assertInvalid(result, "required");
  assert.equal("user_agent" in config, false);
});

test("rejects unknown configuration fields without removing them", async () => {
  const config = await loadReviewedConfig();
  config.arbitrary_url = "https://example.test/";

  const result = validateConfig(config);

  assertInvalid(result, "additionalProperties");
  assert.equal(config.arbitrary_url, "https://example.test/");
});

test("rejects selection URL drift", async () => {
  const config = await loadReviewedConfig();
  config.selection_url = "https://www.drupal.org/api-d7/node.json?page=1";

  assertInvalid(validateConfig(config), "const");
});

test("rejects null and string-coerced numeric values", async () => {
  const nullConfig = await loadReviewedConfig();
  nullConfig.max_records = null;
  assertInvalid(validateConfig(nullConfig), "const");

  const stringConfig = await loadReviewedConfig();
  stringConfig.max_records = "25";
  assertInvalid(validateConfig(stringConfig), "const");
  assert.equal(stringConfig.max_records, "25");
});
