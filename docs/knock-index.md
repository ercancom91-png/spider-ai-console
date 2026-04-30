# Knock Index

Knock Live is a single-session live discovery provider. Knock Index is the self-hosted local crawler/index layer in this repo. It is useful for growing a private index from operator-provided seed URLs, but it is not a Google/Yandex-scale index by itself.

Current local implementation:

- `POST /api/index/crawl`: fetches open HTML seed URLs and same-host links up to the requested depth.
- `data/knock-index.sqlite`: local SQLite/FTS index for title, URL, snippet, and visible text.
- `Knock Index` provider: searches the local FTS index during every audit.
- `GET /api/index/status`: returns local document count and local AI status.

Google/Yandex-scale behavior requires a separate Knock Index system:

- URL frontier: stores crawl queues, priorities, recrawl dates, and source categories.
- Fetch workers: distributed crawlers with rate limits, robots and provider policy handling, retries, and content-type filters.
- Parser workers: extract title, canonical URL, metadata, visible text, profile signals, and removal/contact links.
- Identifier matcher: exact-match and privacy-safe token matching for email, phone, names, usernames, and hashes.
- Inverted index: searchable terms mapped to document IDs, field weights, language, and freshness.
- Evidence store: stores minimal snippets, source links, timestamps, and match proof rather than full page copies by default.
- Classifier: maps each result into Knock! Knock! taxonomy categories and sensitivity/risk labels.
- Removal assistant: links each source category to platform controls, takedown forms, and request templates.

## Scale targets

- Local Knock Live: tens to hundreds of live candidates per run.
- Small private index: millions of documents with one Postgres/OpenSearch node and a few workers.
- Regional index: hundreds of millions of documents with a crawler queue, object storage, and sharded search.
- Google/Yandex class: billions of documents, large crawler fleet, PB-scale storage, sharded serving, continuous recrawl, abuse protection, and legal/provider review.

## Why the UI may show 51 or 60 candidates

That number is not the size of the internet. It is the number of live candidates returned and parsed in the current browser-triggered run. Knock Live runs a bounded number of queries so the app stays responsive. The UI now shows query count, live request count, raw candidates, deduped candidates, and the candidate limit.
