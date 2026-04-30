import test from "node:test";
import assert from "node:assert/strict";
import { buildResultRemediation } from "../src/remediation.js";

test("remediation adds source, search, and data-specific actions", () => {
  const remediation = buildResultRemediation({
    title: "Ayşe Demir",
    url: "https://example.com/profile/ayse",
    snippet: "İletişim: ayse.demo@example.com",
    evidence: [
      { type: "email", label: "E-posta birebir geçti" },
      { type: "name", label: "İsim soyisim birebir geçti" }
    ]
  });

  assert.equal(remediation.host, "example.com");
  assert.ok(remediation.actions.some((action) => action.kind === "source"));
  assert.ok(remediation.actions.some((action) => action.kind === "search"));
  assert.ok(remediation.exposedData.some((item) => item.type === "email"));
  assert.match(remediation.requestTemplate, /example\.com/);
});

test("remediation includes known platform guidance", () => {
  const remediation = buildResultRemediation({
    title: "GitHub profile",
    url: "https://github.com/example",
    snippet: "Public profile",
    evidence: [{ type: "name", label: "İsim soyisim birebir geçti" }]
  });

  assert.ok(remediation.actions.some((action) => action.platform === "GitHub"));
});
