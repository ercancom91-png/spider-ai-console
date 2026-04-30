import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchQueries, normalizeSubject } from "../src/normalizers.js";
import { classifyResult, publicSearchSources } from "../src/taxonomy.js";

test("classifies social media result by host", () => {
  const classification = classifyResult({
    title: "Ayşe Demir - Instagram",
    url: "https://instagram.com/ayse.demo",
    snippet: "Public profile"
  });

  assert.equal(classification.categoryId, "social");
  assert.equal(classification.subcategoryId, "social.instagram");
  assert.equal(classification.sensitivity, "standard");
});

test("red flags adult-sensitive hosts", () => {
  const classification = classifyResult({
    title: "Creator profile",
    url: "https://onlyfans.com/ayse-demo",
    snippet: "Public profile"
  });

  assert.equal(classification.categoryId, "adult-sensitive");
  assert.equal(classification.sensitivity, "adult");
  assert.ok(classification.riskTags.includes("adult-sensitive"));
});

test("wide search adds scoped social domains without sensitive domains by default", () => {
  const subject = normalizeSubject({
    fullName: "Ayşe Demir",
    email: "ayse.demo@example.com"
  });
  const queries = buildSearchQueries(subject, { scanDepth: "wide" });

  assert.ok(queries.some((query) => query.includes("site:instagram.com")));
  assert.ok(queries.some((query) => query.includes("site:x.com")));
  assert.ok(queries.some((query) => query.includes("site:t.me")));
  assert.equal(queries.some((query) => query.includes("site:onlyfans.com")), false);
});

test("maximum sensitive search can add adult-sensitive scope", () => {
  const subject = normalizeSubject({
    fullName: "Ayşe Demir",
    email: "ayse.demo@example.com"
  });
  const queries = buildSearchQueries(subject, {
    scanDepth: "maximum",
    includeSensitiveSources: true
  });

  assert.ok(queries.some((query) => query.includes("site:instagram.com")));
  assert.ok(queries.some((query) => query.includes("site:onlyfans.com")));
});

test("default source catalog includes at least fifty domains per category", () => {
  const sources = publicSearchSources({
    scanDepth: "wide",
    includeSensitiveSources: true
  });

  for (const category of sources) {
    const domains = new Set(
      category.subcategories.flatMap((subcategory) => subcategory.domains)
    );

    assert.ok(domains.size >= 50, `${category.label} has ${domains.size} domains`);
  }
});
