import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSubject } from "../src/normalizers.js";
import { scoreSearchResult } from "../src/matching.js";

test("email and name evidence produces confirmed match", () => {
  const subject = normalizeSubject({
    fullName: "Ayşe Demir",
    email: "ayse.demo@example.com"
  });

  const result = scoreSearchResult(
    {
      title: "Ayşe Demir",
      url: "https://example.com/ayse",
      snippet: "İletişim: ayse.demo@example.com"
    },
    subject.identifiers
  );

  assert.equal(result.matchLevel, "confirmed");
  assert.equal(result.evidence.length, 3);
});

test("unrelated candidate is left without evidence", () => {
  const subject = normalizeSubject({
    fullName: "Ayşe Demir",
    email: "ayse.demo@example.com"
  });

  const result = scoreSearchResult(
    {
      title: "Başka biri",
      url: "https://example.com/other",
      snippet: "Alakasız kamu sayfası"
    },
    subject.identifiers
  );

  assert.equal(result.matchLevel, "review");
  assert.equal(result.evidence.length, 0);
});

test("username and name evidence produces strong match", () => {
  const subject = normalizeSubject({
    fullName: "Ercan Çom",
    email: "ercancom91@gmail.com"
  });

  const result = scoreSearchResult(
    {
      title: "Ercan Çom - Gravatar",
      url: "https://gravatar.com/ercancom91",
      snippet: "Public profile. Username: ercancom91."
    },
    subject.identifiers
  );

  assert.equal(result.matchLevel, "strong");
  assert.ok(result.evidence.some((item) => item.type === "username"));
  assert.ok(result.evidence.some((item) => item.type === "name"));
});

test("name evidence tolerates compact and missing letter variants", () => {
  const subject = normalizeSubject({
    fullName: "Ayşe Demir"
  });

  const result = scoreSearchResult(
    {
      title: "AyseDemr public profile",
      url: "https://example.com/aysedemr",
      snippet: "Açık profil kaydı."
    },
    subject.identifiers
  );

  assert.equal(result.matchLevel, "review");
  assert.ok(result.evidence.some((item) => item.type === "name"));
  assert.match(result.evidence.map((item) => item.label).join(" "), /yazım farkıyla|boşluk farkıyla/);
});

test("phone evidence accepts local country-code variants", () => {
  const subject = normalizeSubject({
    phone: "+90 555 111 2233"
  });

  const result = scoreSearchResult(
    {
      title: "İletişim",
      url: "https://example.com/contact",
      snippet: "Telefon: 0555 111 2233"
    },
    subject.identifiers
  );

  assert.equal(result.matchLevel, "strong");
  assert.ok(result.evidence.some((item) => item.type === "phone"));
});

test("single partial name token is not enough evidence", () => {
  const subject = normalizeSubject({
    fullName: "Ali Veli"
  });

  const result = scoreSearchResult(
    {
      title: "California records",
      url: "https://example.com/california",
      snippet: "Unrelated listing."
    },
    subject.identifiers
  );

  assert.equal(result.evidence.length, 0);
});

test("omnibox single token becomes username evidence", () => {
  const subject = normalizeSubject({
    fullName: "@ercancom91"
  });

  const result = scoreSearchResult(
    {
      title: "ercancom91 - Instagram",
      url: "https://instagram.com/ercancom91",
      snippet: "Public profile preview."
    },
    subject.identifiers
  );

  assert.equal(subject.username, "ercancom91");
  assert.ok(result.evidence.some((item) => item.type === "username"));
});

test("email exact match produces direct tier", () => {
  const subject = normalizeSubject({ fullName: "Ali Veli", email: "ali@test.com" });
  const result = scoreSearchResult(
    { title: "Profile", url: "https://x.com/u", snippet: "Mail: ali@test.com" },
    subject.identifiers
  );
  assert.equal(result.matchTier, "direct");
});

test("phone exact match produces direct tier", () => {
  const subject = normalizeSubject({ phone: "+90 555 111 2233" });
  const result = scoreSearchResult(
    { title: "Iletisim", url: "https://x.com/c", snippet: "0555 111 2233" },
    subject.identifiers
  );
  assert.equal(result.matchTier, "direct");
});

test("username + name exact match produces strong tier", () => {
  const subject = normalizeSubject({ fullName: "Ercan Çom", email: "ercancom91@gmail.com" });
  const result = scoreSearchResult(
    {
      title: "Ercan Çom",
      url: "https://gravatar.com/ercancom91",
      snippet: "Username: ercancom91."
    },
    subject.identifiers
  );
  assert.equal(result.matchTier, "strong");
});

test("only fuzzy name evidence falls into mention tier", () => {
  const subject = normalizeSubject({ fullName: "Ayşe Demir" });
  const result = scoreSearchResult(
    {
      title: "AyseDemr public profile",
      url: "https://example.com/aysedemr",
      snippet: "Açık profil kaydı."
    },
    subject.identifiers
  );
  assert.equal(result.matchTier, "mention");
});

test("rankResults orders direct > strong > mention", async () => {
  const { rankResults } = await import("../src/matching.js");
  const subject = normalizeSubject({ fullName: "Ali Veli", email: "ali@test.com" });
  const ranked = rankResults(
    [
      { title: "Sadece isim", url: "https://a.com", snippet: "Ali Veli" },
      { title: "Tam mail", url: "https://b.com", snippet: "ali@test.com" },
      { title: "Yazim farki", url: "https://c.com", snippet: "AliVel public" }
    ],
    subject.identifiers
  );
  assert.equal(ranked[0].matchTier, "direct");
  assert.ok(["strong", "mention"].includes(ranked[ranked.length - 1].matchTier));
});
