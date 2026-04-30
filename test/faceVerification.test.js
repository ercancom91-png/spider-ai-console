import test from "node:test";
import assert from "node:assert/strict";
import { verifyFaceMatches } from "../src/faceVerification.js";

test("returns no matches when no reference photo is supplied", async () => {
  const result = await verifyFaceMatches([{ url: "https://example.com/x.jpg" }], null);
  assert.equal(result.matches.length, 0);
  assert.match(result.diagnostics.reason, /Referans/);
});

test("returns no matches when reference is unprocessable type", async () => {
  const result = await verifyFaceMatches([], "not-a-buffer-or-data-url");
  assert.equal(result.matches.length, 0);
});

test("diagnostics flag fallback mode when face-api is not available", async () => {
  const buf = Buffer.from([255, 216, 255, 224, 0, 0]); // tiny fake bytes
  const result = await verifyFaceMatches([], buf);
  assert.ok(["fallback-perceptual-hash", "face-api"].includes(result.diagnostics.mode));
});
