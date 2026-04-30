import test from "node:test";
import assert from "node:assert/strict";
import { enabledProviders } from "../src/config.js";

test("provider config exposes self-made live provider", () => {
  const providers = enabledProviders();

  assert.ok(providers.some((provider) => provider.id === "knock-live"));
  assert.ok(providers.some((provider) => provider.id === "spider-images"));
  assert.ok(providers.some((provider) => provider.kind === "web-search"));
});

test("provider config exposes the expanded source catalog", () => {
  const providers = enabledProviders();
  const ids = providers.map((p) => p.id);

  for (const expected of [
    "yandex", "mojeek", "brave", "searx",
    "github", "stackoverflow", "reddit", "hackernews",
    "wayback", "wikipedia"
  ]) {
    assert.ok(ids.includes(expected), `Missing provider: ${expected}`);
  }
});

test("providers requiring credentials are marked accordingly when keys are missing", () => {
  const providers = enabledProviders();
  const findStatus = (id) => providers.find((p) => p.id === id)?.status;

  for (const id of ["bing", "brave", "searx"]) {
    const status = findStatus(id);
    assert.ok(status === "enabled" || status === "needsCredential", `Bad status for ${id}: ${status}`);
  }
});
