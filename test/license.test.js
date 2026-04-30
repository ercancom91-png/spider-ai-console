import test from "node:test";
import assert from "node:assert/strict";
import { generateLicense, validateLicense, readLicenseFromHeaders } from "../src/license.js";

test("generated premium key validates with correct tier", () => {
  const key = generateLicense({ tier: "premium", days: 30 });
  const result = validateLicense(key);
  assert.equal(result.valid, true);
  assert.equal(result.tier, "premium");
  assert.ok(result.daysLeft >= 29 && result.daysLeft <= 30);
});

test("generated free key validates with free tier", () => {
  const key = generateLicense({ tier: "free", days: 0 });
  const result = validateLicense(key);
  assert.equal(result.valid, true);
  assert.equal(result.tier, "free");
});

test("tampered signature fails validation", () => {
  const key = generateLicense({ tier: "premium", days: 30 });
  const tampered = key.slice(0, -1) + (key.slice(-1) === "0" ? "1" : "0");
  const result = validateLicense(tampered);
  assert.equal(result.valid, false);
});

test("malformed key is rejected with reason", () => {
  const result = validateLicense("HELLO-WORLD");
  assert.equal(result.valid, false);
  assert.ok(result.reason.length > 0);
});

test("readLicenseFromHeaders reads X-License-Key header", () => {
  const key = generateLicense({ tier: "premium", days: 7 });
  const result = readLicenseFromHeaders({ "x-license-key": key });
  assert.equal(result.valid, true);
  assert.equal(result.tier, "premium");
});

test("missing header returns free tier", () => {
  const result = readLicenseFromHeaders({});
  assert.equal(result.valid, false);
  assert.equal(result.tier, "free");
});
