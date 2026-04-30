import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSubject } from "../src/normalizers.js";
import { validateConsent } from "../src/privacy.js";

test("strict consent accepts authorized personal audit", () => {
  const subject = normalizeSubject({
    fullName: "Ayşe Demir",
    email: "ayse.demo@example.com"
  });

  const result = validateConsent(
    {
      mode: "strict",
      subjectAuthorization: "self",
      processingPurpose: "personal_audit",
      acceptedNotice: true,
      noSensitiveInference: true,
      retentionDays: 7
    },
    subject
  );

  assert.equal(result.ok, true);
});

test("strict consent rejects missing notice", () => {
  const subject = normalizeSubject({
    fullName: "Ayşe Demir",
    email: "ayse.demo@example.com"
  });

  const result = validateConsent(
    {
      mode: "strict",
      subjectAuthorization: "self",
      processingPurpose: "personal_audit",
      acceptedNotice: false,
      noSensitiveInference: true,
      retentionDays: 7
    },
    subject
  );

  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /kapsamı/);
});

test("strict consent requires extra notice for sensitive sources", () => {
  const subject = normalizeSubject({
    fullName: "Ayşe Demir",
    email: "ayse.demo@example.com"
  });

  const result = validateConsent(
    {
      mode: "strict",
      subjectAuthorization: "self",
      processingPurpose: "personal_audit",
      acceptedNotice: true,
      noSensitiveInference: true,
      includeSensitiveSources: true,
      acceptedSensitiveNotice: false,
      retentionDays: 7
    },
    subject
  );

  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /Hassas kaynak/);
});

test("onboarded mode (default) needs no checkboxes, just a valid subject", () => {
  const subject = normalizeSubject({
    fullName: "Ayşe Demir",
    email: "ayse.demo@example.com"
  });

  const result = validateConsent({}, subject);

  assert.equal(result.ok, true);
  assert.equal(result.mode, "onboarded");
});

test("onboarded mode still rejects request with no valid identifier", () => {
  const subject = normalizeSubject({});
  const result = validateConsent({}, subject);
  assert.equal(result.ok, false);
});

test("onboarded mode silently disables sensitive sources without explicit notice", () => {
  const subject = normalizeSubject({ email: "ali@example.com" });
  const result = validateConsent({ includeSensitiveSources: true }, subject);
  assert.equal(result.ok, true);
  assert.match(result.warnings.join(" "), /Hassas/);
});
