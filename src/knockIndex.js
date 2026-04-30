import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";
import { buildSearchQueries } from "./normalizers.js";

const indexPath = join(process.cwd(), "data", "knock-index.sqlite");
let db;

export function getIndexStatus() {
  const database = getDb();
  const row = database.prepare("SELECT COUNT(*) as count FROM documents").get();
  const latest = database
    .prepare("SELECT indexed_at FROM documents ORDER BY indexed_at DESC LIMIT 1")
    .get();

  return {
    path: indexPath,
    documents: row?.count || 0,
    latestIndexedAt: latest?.indexed_at || null,
    mode: "self-hosted-sqlite-fts"
  };
}

export function indexDocument(document) {
  const database = getDb();
  const now = new Date().toISOString();
  const normalized = {
    url: document.url,
    title: document.title || document.url,
    snippet: document.snippet || "",
    body: document.body || document.snippet || "",
    images: normalizeImages(document.images),
    sourceType: document.sourceType || "knock-crawl",
    indexedAt: document.indexedAt || now
  };

  database
    .prepare(
      `INSERT INTO documents(url, title, snippet, body, source_type, indexed_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(url) DO UPDATE SET
         title=excluded.title,
         snippet=excluded.snippet,
         body=excluded.body,
         source_type=excluded.source_type,
         indexed_at=excluded.indexed_at`
    )
    .run(
      normalized.url,
      normalized.title,
      normalized.snippet,
      normalized.body,
      normalized.sourceType,
      normalized.indexedAt
    );

  database.prepare("DELETE FROM documents_fts WHERE url = ?").run(normalized.url);
  database
    .prepare("INSERT INTO documents_fts(title, body, url) VALUES (?, ?, ?)")
    .run(
      normalized.title,
      `${normalized.snippet}\n${normalized.body}\n${normalized.images
        .map((image) => `${image.alt || ""} ${image.url}`)
        .join("\n")}`,
      normalized.url
    );

  database
    .prepare("UPDATE documents SET images = ? WHERE url = ?")
    .run(JSON.stringify(normalized.images), normalized.url);

  return normalized;
}

export function searchKnockIndex(subject, options = {}) {
  const database = getDb();
  const queries = buildIndexQueries(subject, options);
  const results = [];

  for (const query of queries) {
    const rows = database
      .prepare(
        `SELECT documents_fts.title, documents_fts.body, documents_fts.url, documents.images
         FROM documents_fts
         LEFT JOIN documents ON documents.url = documents_fts.url
         WHERE documents_fts MATCH ?
         LIMIT 25`
      )
      .all(escapeFtsQuery(query));

    for (const row of rows) {
      results.push({
        provider: "SPIDER Index",
        sourceType: "self-hosted-index",
        title: row.title,
        url: row.url,
        snippet: buildSnippet(row.body, query),
        images: parseImages(row.images),
        query,
        fetchedAt: new Date().toISOString()
      });
    }
  }

  return dedupeByUrl(results);
}

function getDb() {
  if (db) return db;

  if (!existsSync(dirname(indexPath))) {
    mkdirSync(dirname(indexPath), { recursive: true });
  }

  db = new DatabaseSync(indexPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      url TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      snippet TEXT NOT NULL,
      body TEXT NOT NULL,
      images TEXT NOT NULL DEFAULT '[]',
      source_type TEXT NOT NULL,
      indexed_at TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(title, body, url UNINDEXED);
  `);
  ensureImagesColumn(db);

  return db;
}

function ensureImagesColumn(database) {
  const columns = database.prepare("PRAGMA table_info(documents)").all();
  const hasImages = columns.some((column) => column.name === "images");
  if (!hasImages) {
    database.prepare("ALTER TABLE documents ADD COLUMN images TEXT NOT NULL DEFAULT '[]'").run();
  }
}

function buildIndexQueries(subject, options) {
  const direct = [];
  if (subject.email) direct.push(subject.email);
  if (subject.username) direct.push(subject.username);
  if (subject.phone?.digits) direct.push(subject.phone.digits);
  if (subject.fullName) direct.push(subject.fullName);

  const webQueries = buildSearchQueries(subject, {
    scanDepth: options.scanDepth === "maximum" ? "wide" : options.scanDepth,
    includeSensitiveSources: options.includeSensitiveSources === true
  })
    .map((query) => query.replaceAll('"', "").replace(/site:[^\s]+/g, "").trim())
    .filter(Boolean);

  return [...new Set([...direct, ...webQueries])].slice(0, config.maxSearchQueries);
}

function escapeFtsQuery(query) {
  return query
    .split(/\s+/)
    .map((part) => `"${part.replace(/"/g, '""')}"`)
    .join(" OR ");
}

function buildSnippet(body = "", query = "") {
  const clean = body.replace(/\s+/g, " ").trim();
  const needle = query.split(/\s+/)[0]?.toLocaleLowerCase("tr") || "";
  const index = needle ? clean.toLocaleLowerCase("tr").indexOf(needle) : -1;
  const start = Math.max(index - 80, 0);
  return clean.slice(start, start + 260) || clean.slice(0, 260);
}

function dedupeByUrl(results) {
  const seen = new Set();
  const deduped = [];

  for (const result of results) {
    if (!result.url || seen.has(result.url)) continue;
    seen.add(result.url);
    deduped.push(result);
  }

  return deduped;
}

function normalizeImages(images = []) {
  if (!Array.isArray(images)) {
    return [];
  }

  return images
    .map((image) => ({
      url: typeof image.url === "string" ? image.url : "",
      alt: typeof image.alt === "string" ? image.alt : "",
      kind: typeof image.kind === "string" ? image.kind : "page-image"
    }))
    .filter((image) => image.url.startsWith("http://") || image.url.startsWith("https://"))
    .slice(0, 16);
}

function parseImages(value = "[]") {
  try {
    return normalizeImages(JSON.parse(value));
  } catch {
    return [];
  }
}
