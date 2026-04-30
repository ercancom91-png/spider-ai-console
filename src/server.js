import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { config, enabledProviders } from "./config.js";
import { normalizeSubject } from "./normalizers.js";
import { buildAuditReport } from "./analysis.js";
import { crawlAndIndex } from "./knockCrawler.js";
import { getIndexStatus } from "./knockIndex.js";
import { buildLocalAiBrief, getLocalAiStatus } from "./localAi.js";
import { validateConsent } from "./privacy.js";
import { runSearchProviders } from "./providers/index.js";
import { publicSearchSources, publicTaxonomy } from "./taxonomy.js";
import { readLicenseFromHeaders, validateLicense } from "./license.js";
import { startBackgroundCrawl, backgroundStatus } from "./backgroundCrawler.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = normalize(join(__dirname, "..", "public"));

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

const server = createServer(async (request, response) => {
  try {
    setSecurityHeaders(response);

    if (request.method === "GET" && request.url === "/api/config") {
      return sendJson(response, {
        providers: enabledProviders(),
        retentionDaysLimit: config.retentionDaysLimit,
        taxonomy: publicTaxonomy(),
        searchSources: publicSearchSources({ scanDepth: "balanced" }),
        index: getIndexStatus(),
        ai: await getLocalAiStatus()
      });
    }

    if (request.method === "GET" && request.url === "/api/index/status") {
      return sendJson(response, {
        index: getIndexStatus(),
        ai: await getLocalAiStatus(),
        backgroundCrawler: backgroundStatus()
      });
    }

    if (request.method === "POST" && request.url === "/api/index/crawl") {
      const body = await readJsonBody(request);
      const result = await crawlAndIndex({
        seeds: Array.isArray(body.seeds) ? body.seeds : [],
        maxPages: clampNumber(body.maxPages, 1, 200, 24),
        maxDepth: clampNumber(body.maxDepth, 0, 4, 2)
      });

      return sendJson(response, {
        ...result,
        index: getIndexStatus()
      });
    }

    if (
      request.method === "POST" &&
      (request.url === "/api/browser/search" || request.url === "/api/audits")
    ) {
      const body = await readJsonBody(request);
      const license = readLicenseFromHeaders(request.headers);
      const searchResponse = await buildBrowserSearchResponse(body, license);

      if (!searchResponse.ok) {
        return sendJson(response, { errors: searchResponse.errors }, 400);
      }

      return sendJson(response, searchResponse.report);
    }

    if (request.method === "POST" && request.url === "/api/license/validate") {
      const body = await readJsonBody(request);
      const result = validateLicense(body.key || "");
      return sendJson(response, result);
    }

    if (request.method === "POST" && request.url === "/api/premium/deleted-photos") {
      const license = readLicenseFromHeaders(request.headers);
      if (license.tier !== "premium") {
        return sendJson(response, {
          error: "Bu özellik premium lisans gerektirir.",
          tier: license.tier
        }, 402);
      }
      const body = await readJsonBody(request);
      const { searchDeletedPhotos } = await import("./providers/premiumPhotoProvider.js");
      const { verifyFaceMatches } = await import("./faceVerification.js");
      const subject = normalizeSubject(body.subject || {});
      const photos = await searchDeletedPhotos(subject, body.options || {});
      const verified = await verifyFaceMatches(photos, body.referencePhoto || null);
      return sendJson(response, {
        license: { tier: license.tier, daysLeft: license.daysLeft },
        candidates: photos.length,
        verified: verified.matches.length,
        results: verified.matches,
        diagnostics: verified.diagnostics
      });
    }

    if (request.method === "GET") {
      return serveStatic(request, response);
    }

    sendJson(response, { error: "Method not allowed" }, 405);
  } catch (error) {
    sendJson(response, { error: error.message || "Unexpected error" }, 500);
  }
});

function normalizeScanDepth(scanDepth) {
  if (scanDepth === "wide" || scanDepth === "maximum") {
    return scanDepth;
  }

  return "balanced";
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

server.listen(config.port, () => {
  console.log(`SPIDER AI Browser running at http://localhost:${config.port}`);
  const bg = startBackgroundCrawl();
  if (bg.started && bg.intervalMs) {
    console.log(`Background crawler enabled (every ${bg.intervalMs / 60000} min)`);
  }
});

async function buildBrowserSearchResponse(body, license = { tier: "free" }) {
  const subject = normalizeSubject(body.subject || {});
  const consent = validateConsent(body.consent || {}, subject);

  if (!consent.ok) {
    return {
      ok: false,
      errors: consent.errors
    };
  }

  const allowSensitive =
    consent.mode === "strict"
      ? body.consent?.includeSensitiveSources === true
      : body.consent?.includeSensitiveSources === true && body.consent?.acceptedSensitiveNotice === true;

  const searchOptions = {
    includeSensitiveSources: allowSensitive,
    scanDepth: normalizeScanDepth(body.search?.scanDepth)
  };
  const providerOutput = await runSearchProviders(subject, searchOptions);
  const combinedWarnings = [...(consent.warnings || []), ...(providerOutput.warnings || [])];
  const report = buildAuditReport({
    subject,
    rawResults: providerOutput.results,
    warnings: combinedWarnings,
    searchOptions,
    providerStatus: providerOutput.providerStatus,
    realSearchAvailable: providerOutput.realSearchAvailable
  });
  const aiBrief = await buildLocalAiBrief(report);

  return {
    ok: true,
    report: {
      ...report,
      aiBrief,
      consentMode: consent.mode,
      license: { tier: license.tier, daysLeft: license.daysLeft || null }
    }
  };
}

async function serveStatic(request, response) {
  const requestedPath = new URL(request.url, `http://${request.headers.host}`).pathname;
  const safePath = requestedPath === "/" ? "/index.html" : requestedPath;
  const filePath = normalize(join(publicDir, safePath));

  if (!filePath.startsWith(publicDir)) {
    return sendJson(response, { error: "Forbidden" }, 403);
  }

  try {
    const file = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream"
    });
    response.end(file);
  } catch {
    sendJson(response, { error: "Not found" }, 404);
  }
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("Request body too large"));
      }
    });

    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });

    request.on("error", reject);
  });
}

function sendJson(response, payload, status = 200) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

function setSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' https: data: blob:; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'"
  );
}
