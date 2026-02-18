"use strict";

require("dotenv").config();

const dns = require("dns");
const https = require("https");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const { Agent, fetch: undiciFetch } = require("undici");
const { Telegraf } = require("telegraf");
const Database = require("better-sqlite3");

if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const PROVIDERS_PATH = process.env.PROVIDERS_PATH || "providers.json";
const DEDUPE_DB = process.env.DEDUPE_DB || "dedupe.db";
const REQUEST_TIMEOUT_MS = readInt("REQUEST_TIMEOUT_MS", 20_000);
const CONNECT_TIMEOUT_MS = readInt("CONNECT_TIMEOUT_MS", REQUEST_TIMEOUT_MS);
const DNS_SERVERS = readList("DNS_SERVERS");
const FETCH_RETRY_COUNT = readInt("FETCH_RETRY_COUNT", 2);
const FETCH_RETRY_DELAY_MS = readInt("FETCH_RETRY_DELAY_MS", 1000);
const CITY_TOPIC_MAP = readCityTopicMap();
let curlDnsServersSupported = true;

const FIXED_POLL_MS = readInt("POLL_MS", 0);
const PEAK_POLL_MS = readInt("PEAK_POLL_MS", 5 * 60 * 1000);
const NORMAL_POLL_MS = readInt("NORMAL_POLL_MS", 10 * 60 * 1000);
const NIGHT_POLL_MS = readInt("NIGHT_POLL_MS", 20 * 60 * 1000);

const DRY_RUN = toBool(process.env.DRY_RUN);
const CKENERJI_LOCATION_TTL_MS = 6 * 60 * 60 * 1000;
const CKENERJI_LOCATION_CONCURRENCY = 5;
const MAX_MESSAGE_LENGTH = 3500;

const connectOptions = { timeout: CONNECT_TIMEOUT_MS };
const customLookup = createLookup(DNS_SERVERS);
if (customLookup) {
  connectOptions.lookup = customLookup;
}
const undiciDispatcher = new Agent({ connect: connectOptions });

if (!BOT_TOKEN || !CHANNEL_ID) {
  console.error("Missing BOT_TOKEN or CHANNEL_ID env vars.");
  process.exit(1);
}

const providerConfigs = loadProviders(PROVIDERS_PATH);
const providers = buildProviders(providerConfigs);
if (!providers.length) {
  console.error(`No enabled providers found in ${PROVIDERS_PATH}.`);
  process.exit(1);
}

console.log(`Loaded providers: ${providers.map((item) => item.id).join(", ")}.`);

const bot = new Telegraf(BOT_TOKEN);

const db = new Database(DEDUPE_DB);
db.exec(`
  CREATE TABLE IF NOT EXISTS sent (
    key TEXT PRIMARY KEY,
    sent_at TEXT NOT NULL
  );
`);

const isSentStmt = db.prepare("SELECT 1 FROM sent WHERE key = ?");
const markSentStmt = db.prepare(
  "INSERT OR IGNORE INTO sent(key, sent_at) VALUES (?, datetime('now'))"
);

let timer = null;
let inFlight = false;
const ckenerjiLocationCache = new Map();

function readInt(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readList(name) {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readCityTopicMap() {
  const raw = process.env.CITY_TOPIC_MAP || process.env.CITY_TOPIC_IDS;
  if (!raw) return new Map();
  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const map = new Map();

  for (const entry of entries) {
    const separatorIndex = entry.search(/[:=]/);
    if (separatorIndex === -1) continue;
    const name = entry.slice(0, separatorIndex).trim();
    const idRaw = entry.slice(separatorIndex + 1).trim();
    if (!name || !idRaw) continue;
    const id = Number(idRaw);
    if (!Number.isFinite(id) || id <= 0) continue;
    map.set(normalizeTopicKey(name), id);
  }

  return map;
}

function toBool(value) {
  if (!value) return false;
  return ["1", "true", "yes", "y", "on"].includes(String(value).toLowerCase());
}

function normalize(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function foldAscii(value) {
  return String(value ?? "")
    .replace(/\u0131/g, "i")
    .replace(/\u0130/g, "i")
    .replace(/\u015f/g, "s")
    .replace(/\u015e/g, "s")
    .replace(/\u011f/g, "g")
    .replace(/\u011e/g, "g")
    .replace(/\u00fc/g, "u")
    .replace(/\u00dc/g, "u")
    .replace(/\u00f6/g, "o")
    .replace(/\u00d6/g, "o")
    .replace(/\u00e7/g, "c")
    .replace(/\u00c7/g, "c");
}

function normalizeTopicKey(value) {
  const text = foldAscii(normalize(value));
  return text ? text.toLowerCase() : "";
}

function getTopicIdForCity(city) {
  if (!CITY_TOPIC_MAP || CITY_TOPIC_MAP.size === 0) return null;
  const key = normalizeTopicKey(city);
  if (!key) return null;
  return CITY_TOPIC_MAP.get(key) || null;
}

function extractLabelBlock(text, label, nextLabels) {
  if (!text) return "";
  const folded = foldAscii(text).toLowerCase();
  const labelKey = foldAscii(label).toLowerCase();
  let start = folded.indexOf(labelKey);
  if (start === -1) return "";
  start += labelKey.length;

  while (start < text.length && [":", " "].includes(text[start])) {
    start += 1;
  }

  let end = text.length;
  for (const nextLabel of nextLabels) {
    const nextKey = foldAscii(nextLabel).toLowerCase();
    const idx = folded.indexOf(nextKey, start);
    if (idx !== -1 && idx < end) {
      end = idx;
    }
  }

  return normalize(text.slice(start, end));
}

function normalizeKeyPart(value) {
  const text = normalize(value);
  return text ? text.toLowerCase() : "";
}

function normalizeDedupeValue(value) {
  const text = normalizeKeyPart(value);
  if (!text) return "";
  if (text === "0" || /^0+$/.test(text)) return "";
  if (text === "null" || text === "undefined" || text === "nan") return "";
  if (text.startsWith("0001-01-01")) return "";
  return text;
}

function normalizeKeyList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value];
}

function normalizeCityLabel(city) {
  const value = normalize(city);
  return value || "Bilinmeyen";
}

async function mapWithConcurrency(items, limit, worker) {
  if (!items.length) return [];
  const safeLimit = Math.max(1, limit || 1);
  const results = new Array(items.length);
  let index = 0;

  const runners = new Array(Math.min(safeLimit, items.length))
    .fill(null)
    .map(async () => {
      while (index < items.length) {
        const current = index++;
        results[current] = await worker(items[current], current);
      }
    });

  await Promise.all(runners);
  return results;
}

function getByPath(obj, pathValue) {
  if (!obj || !pathValue) return undefined;
  return pathValue
    .split(".")
    .reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function pickValue(obj, fieldSpec) {
  const keys = normalizeKeyList(fieldSpec);
  for (const key of keys) {
    if (!obj) return undefined;
    const value = key.includes(".") ? getByPath(obj, key) : obj[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function mapText(obj, fieldSpec) {
  return normalize(pickValue(obj, fieldSpec));
}

function createLookup(servers) {
  if (!servers || servers.length === 0) return null;

  const resolver = new dns.promises.Resolver();
  resolver.setServers(servers);

  return (hostname, options, callback) => {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    const family = options && options.family ? options.family : 4;
    const wantAll = options && options.all === true;
    const resolve =
      family === 6
        ? resolver.resolve6.bind(resolver)
        : resolver.resolve4.bind(resolver);

    const promise = resolve(hostname).then((addresses) => {
      if (!addresses || addresses.length === 0) {
        const err = new Error(`No records for ${hostname}`);
        err.code = "ENOTFOUND";
        throw err;
      }
      if (wantAll) {
        return addresses.map((address) => ({ address, family }));
      }
      return { address: addresses[0], family };
    });

    if (typeof callback === "function") {
      promise
        .then((result) => {
          if (wantAll) {
            callback(null, result);
          } else {
            callback(null, result.address, result.family);
          }
        })
        .catch((err) => callback(err));
      return undefined;
    }

    return promise;
  };
}

function loadProviders(filePath) {
  const fullPath = path.resolve(filePath);
  let raw;

  try {
    raw = fs.readFileSync(fullPath, "utf8");
  } catch (err) {
    console.error(`Failed to read providers config at ${fullPath}.`);
    console.error(err && err.message ? err.message : err);
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.providers)) return parsed.providers;
    return [];
  } catch (err) {
    console.error(`Invalid JSON in providers config at ${fullPath}.`);
    console.error(err && err.message ? err.message : err);
    return [];
  }
}

function buildProviders(configs) {
  const providersList = [];
  const skipped = [];

  configs.forEach((config, index) => {
    if (!config) return;
    const label = config.id || config.city || `provider-${index}`;
    if (config.enabled === false) {
      skipped.push(label);
      return;
    }
    if (!config.url) {
      skipped.push(label);
      return;
    }

    providersList.push({
      id: config.id || `provider-${index}`,
      kind: config.kind || "water",
      city: config.city || "",
      source: config.source || config.id || `provider-${index}`,
      sourceUrl: config.sourceUrl || "",
      url: config.url,
      listPath: config.listPath || "",
      format: config.format || "json",
      parser: config.parser || "",
      fieldMap: config.fieldMap || {},
      request: config.request || {}
    });
  });

  if (skipped.length) {
    console.log(`Skipped providers: ${skipped.join(", ")}.`);
  }

  return providersList;
}

function buildRequestOptions(request) {
  if (!request) return {};
  const headers = Object.assign({}, request.headers || {});
  let body = request.body;
  if (body && typeof body === "object") {
    body = JSON.stringify(body);
    if (!headers["content-type"]) {
      headers["content-type"] = "application/json";
    }
  }

  const options = {};
  if (request.method) options.method = request.method;
  if (Object.keys(headers).length) options.headers = headers;
  if (body !== undefined) options.body = body;
  return options;
}

function hasHeader(headers, name) {
  if (!headers) return false;
  const target = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === target);
}

const RETRYABLE_ERROR_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
  "ECONNREFUSED",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_RESPONSE_TIMEOUT"
]);

function isRetryableFetchError(err) {
  if (!err) return false;
  const code = err.code || (err.cause && err.cause.code);
  if (code && RETRYABLE_ERROR_CODES.has(code)) return true;
  const causeMessage =
    err.cause && err.cause.message ? err.cause.message : "";
  return causeMessage.includes("secure TLS connection");
}

function isInvalidHeaderTokenError(err) {
  if (!err) return false;
  const code = err.code || (err.cause && err.cause.code);
  if (code === "HPE_INVALID_HEADER_TOKEN") return true;
  const message = err.message ? err.message.toLowerCase() : "";
  if (message.includes("invalid header token")) return true;
  const causeMessage =
    err.cause && err.cause.message ? err.cause.message.toLowerCase() : "";
  return causeMessage.includes("invalid header token");
}

async function fetchWithCurlFallback(
  fetchFn,
  fallbackFn,
  url,
  timeoutMs,
  options,
  allowFallback
) {
  try {
    return await fetchFn(url, timeoutMs, options);
  } catch (err) {
    if (!allowFallback || !isInvalidHeaderTokenError(err)) {
      throw err;
    }
    return await fallbackFn(url, timeoutMs, options);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, timeoutMs, options = {}) {
  const attempts = Math.max(1, FETCH_RETRY_COUNT || 1);
  let attempt = 0;
  let lastErr;

  while (attempt < attempts) {
    attempt += 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const requestOptions = {
        signal: controller.signal,
        dispatcher: undiciDispatcher
      };
      if (options.method) requestOptions.method = options.method;
      if (options.headers) requestOptions.headers = options.headers;
      if (options.body !== undefined) requestOptions.body = options.body;

      const res = await undiciFetch(url, requestOptions);
      if (!res.ok) {
        const err = new Error(`Request failed with status ${res.status}`);
        err.status = res.status;
        throw err;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt >= attempts || !isRetryableFetchError(err)) {
        throw err;
      }
      await sleep(FETCH_RETRY_DELAY_MS * attempt);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastErr;
}

function fetchLegacy(url, timeoutMs, options = {}) {
  return new Promise((resolve, reject) => {
    const headers = Object.assign({}, options.headers || {});
    if (options.body !== undefined && !hasHeader(headers, "content-length")) {
      const bodyValue =
        typeof options.body === "string" || Buffer.isBuffer(options.body)
          ? options.body
          : String(options.body);
      headers["content-length"] = Buffer.byteLength(bodyValue);
    }

    const requestOptions = {
      method: options.method || "GET",
      headers,
      timeout: timeoutMs,
      insecureHTTPParser: true
    };
    if (customLookup) requestOptions.lookup = customLookup;

    const req = https.request(url, requestOptions, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const buffer = Buffer.concat(chunks);
        const text = buffer.toString("utf8");
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          const err = new Error(`Request failed with status ${res.statusCode}`);
          err.status = res.statusCode;
          err.body = text;
          reject(err);
          return;
        }
        resolve(text);
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("Request timeout"));
    });

    if (options.body !== undefined) {
      req.write(options.body);
    }
    req.end();
  });
}

async function fetchWithRetryLegacy(url, timeoutMs, options = {}) {
  const attempts = Math.max(1, FETCH_RETRY_COUNT || 1);
  let attempt = 0;
  let lastErr;

  while (attempt < attempts) {
    attempt += 1;
    try {
      return await fetchLegacy(url, timeoutMs, options);
    } catch (err) {
      lastErr = err;
      if (attempt >= attempts || !isRetryableFetchError(err)) {
        throw err;
      }
      await sleep(FETCH_RETRY_DELAY_MS * attempt);
    }
  }

  throw lastErr;
}

async function fetchJsonLegacy(url, timeoutMs, options = {}) {
  const text = await fetchWithRetryLegacy(url, timeoutMs, options);
  return JSON.parse(text.replace(/^\uFEFF/, ""));
}

async function fetchTextLegacy(url, timeoutMs, options = {}) {
  return await fetchWithRetryLegacy(url, timeoutMs, options);
}

function getCurlErrorCode(message) {
  if (!message) return "";
  const match = message.match(/curl:\s*\((\d+)\)/i);
  if (!match) return "";
  const code = Number(match[1]);
  switch (code) {
    case 6:
      return "ENOTFOUND";
    case 7:
      return "ECONNREFUSED";
    case 28:
      return "ETIMEDOUT";
    case 35:
    case 52:
    case 56:
      return "ECONNRESET";
    default:
      return "";
  }
}

function shouldRetryCurlWithoutDnsServers(message) {
  if (!message) return false;
  const text = String(message).toLowerCase();
  if (!text.includes("--dns-servers")) return false;
  return (
    text.includes("does not support") ||
    text.includes("unknown option") ||
    text.includes("not supported")
  );
}

function fetchWithCurl(url, timeoutMs, options = {}, allowDnsServers = true) {
  return new Promise((resolve, reject) => {
    const args = ["-sS", "-L", "--http1.1"];
    const maxSeconds = Math.max(1, Math.ceil((timeoutMs || 0) / 1000));
    args.push("--max-time", String(maxSeconds));
    if (
      allowDnsServers &&
      curlDnsServersSupported &&
      DNS_SERVERS &&
      DNS_SERVERS.length
    ) {
      args.push("--dns-servers", DNS_SERVERS.join(","));
    }
    const connectMs =
      typeof CONNECT_TIMEOUT_MS === "number" && CONNECT_TIMEOUT_MS > 0
        ? CONNECT_TIMEOUT_MS
        : timeoutMs;
    if (connectMs) {
      const connectSeconds = Math.max(
        1,
        Math.min(maxSeconds, Math.ceil(connectMs / 1000))
      );
      args.push("--connect-timeout", String(connectSeconds));
    }

    const method = options.method || "GET";
    if (method && method.toUpperCase() !== "GET") {
      args.push("-X", method);
    }

    const headers = options.headers || {};
    for (const [key, value] of Object.entries(headers)) {
      if (value === undefined || value === null) continue;
      args.push("-H", `${key}: ${value}`);
    }

    let body = options.body;
    if (body !== undefined) {
      if (!Buffer.isBuffer(body)) {
        body = typeof body === "string" ? body : String(body);
      }
      args.push("--data-binary", "@-");
    }

    args.push(url);

    const curlBin = process.platform === "win32" ? "curl.exe" : "curl";
    const curl = spawn(curlBin, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";

    curl.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    curl.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    curl.on("error", (err) => reject(err));
    curl.on("close", (code) => {
      if (code !== 0) {
        const message = stderr.trim() || `curl exited with code ${code}`;
        if (allowDnsServers && shouldRetryCurlWithoutDnsServers(message)) {
          curlDnsServersSupported = false;
          fetchWithCurl(url, timeoutMs, options, false)
            .then(resolve)
            .catch(reject);
          return;
        }
        const err = new Error(message);
        const curlCode = getCurlErrorCode(message);
        if (curlCode) err.code = curlCode;
        reject(err);
        return;
      }
      resolve(stdout);
    });

    if (body !== undefined) {
      curl.stdin.write(body);
    }
    curl.stdin.end();
  });
}

async function fetchWithRetryCurl(url, timeoutMs, options = {}) {
  const attempts = Math.max(1, FETCH_RETRY_COUNT || 1);
  let attempt = 0;
  let lastErr;

  while (attempt < attempts) {
    attempt += 1;
    try {
      return await fetchWithCurl(url, timeoutMs, options);
    } catch (err) {
      lastErr = err;
      if (attempt >= attempts || !isRetryableFetchError(err)) {
        throw err;
      }
      await sleep(FETCH_RETRY_DELAY_MS * attempt);
    }
  }

  throw lastErr;
}

async function fetchJsonCurl(url, timeoutMs, options = {}) {
  const text = await fetchWithRetryCurl(url, timeoutMs, options);
  return JSON.parse(text.replace(/^\uFEFF/, ""));
}

async function fetchTextCurl(url, timeoutMs, options = {}) {
  return await fetchWithRetryCurl(url, timeoutMs, options);
}

async function fetchJson(url, timeoutMs, options = {}) {
  const res = await fetchWithRetry(url, timeoutMs, options);
  return await res.json();
}

async function fetchText(url, timeoutMs, options = {}) {
  const res = await fetchWithRetry(url, timeoutMs, options);
  return await res.text();
}

function extractList(data, listPath) {
  if (listPath) {
    const list = getByPath(data, listPath);
    if (Array.isArray(list)) return list;
  }
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.Liste)) return data.Liste;
  if (Array.isArray(data?.list)) return data.list;
  return [];
}

function getListByKeys(obj, keys) {
  if (!obj) return [];
  for (const key of keys) {
    if (Array.isArray(obj[key])) return obj[key];
  }
  return [];
}

async function parseJsonProvider(provider, data) {
  switch (provider.parser) {
    case "iski-regional":
      return parseIskiRegional(data, provider);
    case "gdz-outages":
      return parseGdzOutages(data, provider);
    case "ckenerji-outages":
      return await parseCkEnerjiOutages(data, provider);
    default:
      return null;
  }
}

function parseHtmlProvider(provider, html) {
  switch (provider.parser) {
    case "aski-kesinti":
      return parseAskiHtml(html, provider);
    case "buski-geojson":
      return parseBuskiGeojson(html, provider);
    case "asat-kesinti-list":
      return parseAsatHtml(html, provider);
    default:
      throw new Error(`Unknown HTML parser: ${provider.parser || "none"}`);
  }
}

function parseIskiRegional(data, provider) {
  const list = extractList(data, provider.listPath);
  return list.map((entry) => {
    const district = normalize(entry.ilceAdi);
    const reasonParts = [];
    if (entry.arizaAdedi !== undefined && entry.arizaAdedi !== null) {
      reasonParts.push(`Ariza adedi: ${entry.arizaAdedi}`);
    }
    if (
      entry.etkilenenMahalleAdedi !== undefined &&
      entry.etkilenenMahalleAdedi !== null
    ) {
      reasonParts.push(`Etkilenen mahalle adedi: ${entry.etkilenenMahalleAdedi}`);
    }
    return createProviderItem(provider, {
      district,
      reason: normalize(reasonParts.join(", ")),
      type: "Ariza",
      rawId: normalize(entry.ilceKodu || entry.ilceAdi),
      raw: entry
    });
  });
}

function parseGdzOutages(data, provider) {
  const container = data && data.data ? data.data : data;
  const planned = getListByKeys(container, [
    "Planland\u0131",
    "Planlandi",
    "Planlanan"
  ]);
  const started = getListByKeys(container, [
    "Ba\u015flad\u0131",
    "Basladi",
    "Baslandi"
  ]);

  const items = [];
  for (const entry of planned) {
    items.push(mapGdzEntry(entry, provider, "Planli"));
  }
  for (const entry of started) {
    items.push(mapGdzEntry(entry, provider, "Anlik"));
  }
  return items;
}

function mapGdzEntry(entry, provider, listType) {
  const district = normalize(entry.Ilce);
  const neighborhood = normalize(entry.Mahalle);
  const street = normalize(entry.Sokak);
  const neighborhoodFull = normalize([neighborhood, street].filter(Boolean).join(" "));
  const start = normalize(
    entry.Planlanan_Baslangic_Zamani || entry.Baslangic_Zamani || entry.Baslangic
  );
  const end = normalize(
    entry.Planlanan_Sona_Erme_Zamani || entry.Sona_Erme_Zamani || entry.Bitis
  );
  const status = normalize(entry.Durum || listType);
  const reason = normalize(
    entry.Aciklama || entry.Neden || entry.Kesinti_Nedeni || entry.KesintiNedeni || ""
  );
  const rawId = normalize(entry.Kesinti_ID || entry.KesintiID || entry.Id);

  return createProviderItem(provider, {
    district,
    neighborhood: neighborhoodFull,
    start,
    end,
    reason,
    type: listType,
    status,
    rawId,
    raw: entry
  });
}

function getCkEnerjiLocationFromCache(cacheKey) {
  if (!cacheKey) return null;
  const cached = ckenerjiLocationCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.ts > CKENERJI_LOCATION_TTL_MS) {
    ckenerjiLocationCache.delete(cacheKey);
    return null;
  }
  return cached.value;
}

function setCkEnerjiLocationCache(cacheKey, value) {
  if (!cacheKey) return;
  ckenerjiLocationCache.set(cacheKey, { ts: Date.now(), value });
}

function getCkEnerjiCompanyKey(provider) {
  if (!provider) return "";
  const raw = normalize(provider.ckEnerjiKey || provider.source || provider.id);
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (upper.includes("BEDAS")) return "BEDAS";
  if (upper.includes("AYEDAS")) return "AYEDAS";
  if (upper.includes("AEDAS")) return "AEDAS";
  if (upper.includes("BASKENT")) return "BASKENT";
  return "";
}

function getCkEnerjiCacheKey(tmno, provider) {
  if (!tmno) return "";
  const company = getCkEnerjiCompanyKey(provider);
  return company ? `${company}|${tmno}` : tmno;
}

async function fetchCkEnerjiLocation(tmno, provider) {
  const company = getCkEnerjiCompanyKey(provider);
  if (!tmno || !company) {
    return { district: "", neighborhood: "" };
  }

  const cacheKey = getCkEnerjiCacheKey(tmno, provider);
  const cached = getCkEnerjiLocationFromCache(cacheKey);
  if (cached) return cached;

  const url = `https://kesintiapi.ckenerji.com.tr/${company}/GetLocation?tmno=${encodeURIComponent(
    tmno
  )}`;

  try {
    const data = await fetchJson(url, REQUEST_TIMEOUT_MS);
    const result = Array.isArray(data?.results)
      ? data.results.find((item) => item && (item.ilce || item.mahalle))
      : null;
    const value = {
      district: normalize(result?.ilce),
      neighborhood: normalize(result?.mahalle)
    };
    setCkEnerjiLocationCache(cacheKey, value);
    return value;
  } catch (_err) {
    const value = { district: "", neighborhood: "" };
    setCkEnerjiLocationCache(cacheKey, value);
    return value;
  }
}

async function parseCkEnerjiOutages(data, provider) {
  const outages = Array.isArray(data?.Outage) ? data.Outage : [];
  if (!outages.length) return [];

  const tmnos = [
    ...new Set(outages.map((entry) => normalize(entry.CBS_TM_NO)).filter(Boolean))
  ];
  const locations = await mapWithConcurrency(
    tmnos,
    CKENERJI_LOCATION_CONCURRENCY,
    (tmno) => fetchCkEnerjiLocation(tmno, provider)
  );
  const locationMap = new Map();
  tmnos.forEach((tmno, idx) => {
    locationMap.set(tmno, locations[idx]);
  });

  return outages.map((entry) => {
    const tmno = normalize(entry.CBS_TM_NO);
    const location = tmno ? locationMap.get(tmno) : null;
    const district = location?.district || "";
    const neighborhood = location?.neighborhood || "";
    const status = normalize(entry.BILDIRIM_TURU);
    const rawId = normalize(entry.OUTAGE_NO || entry.XFMR_ID || tmno);

    return createProviderItem(provider, {
      district,
      neighborhood,
      start: normalize(entry.RPTD_DATE),
      end: normalize(entry.EST_REPAIR_TIME),
      duration: normalize(entry.SURE),
      reason: normalize(entry.MESSAGE),
      type: status,
      status,
      rawId,
      raw: entry
    });
  });
}

function parseAskiHtml(html, provider) {
  const $ = cheerio.load(html);
  const items = [];

  $("ul.history li.appear-animation").each((_idx, element) => {
    const headings = $(element)
      .find("h4.heading-primary strong")
      .map((_i, el) => normalize($(el).text()))
      .get();

    const district = headings[0] || "";
    const type = headings[1] || "";
    const rawText = normalize($(element).find("p").text());

    const start = extractLabelBlock(rawText, "Ariza Tarihi", [
      "Tamir Tarihi",
      "Detay",
      "Etkilenen Yerler"
    ]);
    const end = extractLabelBlock(rawText, "Tamir Tarihi", [
      "Detay",
      "Etkilenen Yerler"
    ]);
    const detail = extractLabelBlock(rawText, "Detay", ["Etkilenen Yerler"]);
    const affected = extractLabelBlock(rawText, "Etkilenen Yerler", []);

    const reasonParts = [];
    if (detail) reasonParts.push(detail);
    if (affected) reasonParts.push(`Etkilenen yerler: ${affected}`);

    items.push(
      createProviderItem(provider, {
        district,
        start,
        end,
        reason: normalize(reasonParts.join(" ")),
        type,
        rawId: normalize([district, start].filter(Boolean).join("|")),
        raw: rawText
      })
    );
  });

  return items;
}

function parseBuskiGeojson(html, provider) {
  const match = html.match(/const\\s+mainData\\s*=\\s*(\\{[\\s\\S]*?\\})\\s*;/);
  if (!match) return [];

  let data;
  try {
    data = JSON.parse(match[1]);
  } catch (_err) {
    return [];
  }

  const features = Array.isArray(data.features) ? data.features : [];
  return features.map((feature) => {
    const props = feature.properties || {};
    return createProviderItem(provider, {
      district: normalize(props.ILCE_ADI),
      neighborhood: normalize(props.MAHALLE_ADI),
      start: normalize(props.PLANLANAN_BASLANGIC_TARIHI || props.KESIM_TARIHI),
      end: normalize(props.PLANLANAN_BITIS_TARIHI),
      reason: normalize(props.WEB_ACIKLAMA),
      status: normalize(props.DURUM),
      rawId: normalize(props.SU_KESINTI_NO || feature.id),
      raw: props
    });
  });
}

function parseAsatHtml(html, provider) {
  const $ = cheerio.load(html);
  const items = [];

  $("#form_grid_1 tbody tr").each((_idx, row) => {
    const getCell = (field) =>
      normalize($(row).find(`td[data-field=\"${field}\"]`).text());

    const district = getCell("IlceId");
    const neighborhood = getCell("MahalleId");
    const street = getCell("Sokak");
    const affected = getCell("EtkilenenMahalleler");
    const reason = getCell("KesintiNedeniId");
    const description = getCell("Aciklama");
    const start = getCell("BaslangicTarihSaat");
    const end = getCell("BitisTarihiSaat");
    const estimated = getCell("TahminiBitisTarihSaat");
    const status = getCell("KesintiSonlandi");

    const reasonParts = [];
    if (reason) reasonParts.push(reason);
    if (description) reasonParts.push(description);
    if (affected) reasonParts.push(`Etkilenen: ${affected}`);

    const duration = estimated ? `Tahmini bitis: ${estimated}` : "";

    if (!district && !neighborhood && !reasonParts.length) {
      return;
    }

    items.push(
      createProviderItem(provider, {
        district,
        neighborhood: normalize([neighborhood, street].filter(Boolean).join(" ")),
        start,
        end,
        duration,
        reason: normalize(reasonParts.join(" ")),
        status,
        rawId: normalize([district, start, end, reason].filter(Boolean).join("|"))
      })
    );
  });

  return items;
}

function createProviderItem(provider, fields) {
  return {
    providerId: provider.id,
    source: provider.source || provider.id,
    sourceUrl: provider.sourceUrl || provider.url,
    kind: provider.kind || "water",
    city: provider.city || "",
    district: fields.district || "",
    neighborhood: fields.neighborhood || "",
    start: fields.start || "",
    end: fields.end || "",
    duration: fields.duration || "",
    reason: fields.reason || "",
    type: fields.type || "",
    status: fields.status || "",
    rawId: fields.rawId || "",
    raw: fields.raw || null
  };
}

function fixUedasText(value) {
  if (!value) return value;
  const text = String(value);
  if (!text.includes("?")) return value;
  return text
    .replace(
      /\?ebeke\s+\?al\?\?mas\?/gi,
      "\u015eebeke \u00e7al\u0131\u015fmas\u0131"
    )
    .replace(/\?ebeke/gi, "\u015eebeke")
    .replace(/\?al\?\?mas\?/gi, "\u00e7al\u0131\u015fmas\u0131");
}

function mapItem(raw, provider) {
  const fieldMap = provider.fieldMap || {};
  let district = mapText(raw, fieldMap.district);
  let neighborhood = mapText(raw, fieldMap.neighborhood);
  const start = mapText(raw, fieldMap.start);
  const end = mapText(raw, fieldMap.end);
  const duration = mapText(raw, fieldMap.duration);
  let reason = mapText(raw, fieldMap.reason);
  let type = mapText(raw, fieldMap.type);
  let status = mapText(raw, fieldMap.status);
  const rawId = mapText(raw, fieldMap.rawId);

  if (
    provider.id === "bursa-uedas-electric" ||
    /uedas/i.test(provider.source || "")
  ) {
    district = fixUedasText(district);
    neighborhood = fixUedasText(neighborhood);
    reason = fixUedasText(reason);
    type = fixUedasText(type);
    status = fixUedasText(status);
  }

  return createProviderItem(provider, {
    district,
    neighborhood,
    start,
    end,
    duration,
    reason,
    type,
    status,
    rawId,
    raw
  });
}

function buildDedupeKey(item) {
  const rawId = normalizeDedupeValue(item.rawId);
  if (rawId) {
    const parts = [item.providerId, item.kind, rawId]
      .map(normalizeKeyPart)
      .filter(Boolean);
    return parts.length ? parts.join("|") : "";
  }

  const start = normalizeDedupeValue(item.start);
  const end = normalizeDedupeValue(item.end);
  const duration = normalizeDedupeValue(item.duration);

  const parts = [
    item.providerId,
    item.kind,
    item.city,
    item.district,
    item.neighborhood,
    start,
    end
  ]
    .map(normalizeKeyPart)
    .filter(Boolean);

  if (!start && !end && duration) {
    parts.push(duration);
  }

  return parts.length ? parts.join("|") : "";
}

function buildLegacyDedupeKey(item) {
  const parts = [
    item.providerId,
    item.kind,
    item.rawId,
    item.city,
    item.district,
    item.neighborhood,
    item.duration,
    item.start,
    item.end,
    item.reason,
    item.type,
    item.status
  ]
    .map(normalizeKeyPart)
    .filter(Boolean);

  return parts.length ? parts.join("|") : "";
}

function formatMessage(item) {
  const isElectric = item.kind === "electric";
  const title = isElectric
    ? "\u{1F534} <b>ELEKTRIK KESINTISI</b>"
    : "\u{1F535} <b>SU KESINTISI</b>";

  const city = escapeHtml(item.city || "-");
  const district = escapeHtml(item.district || "-");
  const neighborhood = escapeHtml(item.neighborhood || "-");
  const reason = escapeHtml(item.reason || "-");
  const type = escapeHtml(item.type || "-");
  const status = escapeHtml(item.status || "-");
  const durationText = escapeHtml(formatOutageWindow(item));

  return [
    title,
    `\u{1F3D9}\uFE0F <b>Sehir:</b> <b>${city}</b>`,
    `\u{1F4CD} <b>Ilce:</b> ${district}`,
    `\u{1F3D8}\uFE0F <b>Mahalle:</b> ${neighborhood}`,
    `\u{23F1}\uFE0F <b>Kesinti:</b> ${durationText}`,
    `\u{1F9E9} <b>Tip:</b> ${type}`,
    `\u{1F9ED} <b>Durum:</b> ${status}`,
    `\u{1F4DD} <b>Aciklama:</b> ${reason}`
  ].join("\n");
}

function formatCityMessages(group) {
  const city = escapeHtml(group.city);
  const headerLine = "\u2501".repeat(12);
  const header = `\u{1F3D9}\u{FE0F} <b>${city}</b>\n${headerLine}`;

  const electricItems = group.items.filter((entry) => entry.item.kind === "electric");
  const waterItems = group.items.filter((entry) => entry.item.kind !== "electric");

  const sections = [];
  if (electricItems.length) {
    sections.push({
      label: "\u{1F534} <b>ELEKTRIK</b> \u26A1",
      items: electricItems
    });
  }
  if (waterItems.length) {
    sections.push({
      label: "\u{1F535} <b>SU</b> \u{1F4A7}",
      items: waterItems
    });
  }

  sections.forEach((section) => {
    section.items = groupSectionItems(section.items);
    section.items.sort(compareItemsByLocation);
  });

  const messages = [];
  let currentLines = [header];
  let currentLength = header.length;
  let currentKeys = [];
  let currentSources = new Map();

  const flushCurrent = () => {
    if (currentLines.length === 1) return;
    messages.push({
      text: currentLines.join("\n"),
      keys: currentKeys,
      sources: currentSources
    });
    currentLines = [header];
    currentLength = header.length;
    currentKeys = [];
    currentSources = new Map();
  };

  for (const section of sections) {
    let sectionStarted = false;
    let sectionItemIndex = 0;
    for (const entry of section.items) {
      const line = formatItemCard(entry.item, entry.count);
      let spacingLength = sectionItemIndex > 0 ? 1 : 0;
      let requiredLength =
        (sectionStarted ? 0 : section.label.length + 1) +
        spacingLength +
        line.length +
        1;

      if (
        currentLength + requiredLength > MAX_MESSAGE_LENGTH &&
        currentLines.length > 1
      ) {
        flushCurrent();
        sectionStarted = false;
        sectionItemIndex = 0;
        spacingLength = 0;
        requiredLength =
          (sectionStarted ? 0 : section.label.length + 1) + line.length + 1;
      }

      if (!sectionStarted) {
        currentLines.push(section.label);
        currentLength += section.label.length + 1;
        sectionStarted = true;
      }

      if (sectionItemIndex > 0) {
        currentLines.push("");
        currentLength += 1;
      }

      currentLines.push(line);
      currentLength += line.length + 1;
      currentKeys.push(...entry.keys);
      for (const item of entry.items) {
        mergeSource(currentSources, item);
      }
      sectionItemIndex += 1;
    }
  }

  if (currentLines.length > 1) {
    messages.push({
      text: currentLines.join("\n"),
      keys: currentKeys,
      sources: currentSources
    });
  }

  return messages;
}

function compareItemsByLocation(a, b) {
  const itemA = a.item || a;
  const itemB = b.item || b;
  const districtA = normalizeKeyPart(itemA.district);
  const districtB = normalizeKeyPart(itemB.district);
  if (districtA !== districtB) return districtA.localeCompare(districtB);
  const neighborhoodA = normalizeKeyPart(itemA.neighborhood);
  const neighborhoodB = normalizeKeyPart(itemB.neighborhood);
  return neighborhoodA.localeCompare(neighborhoodB);
}

function groupSectionItems(entries) {
  const grouped = new Map();

  for (const entry of entries) {
    const signature = formatItemSignature(entry.item);
    let group = grouped.get(signature);
    if (!group) {
      group = {
        signature,
        count: 0,
        keys: [],
        items: [],
        item: entry.item
      };
      grouped.set(signature, group);
    }
    group.count += 1;
    group.keys.push(entry.key);
    group.items.push(entry.item);
  }

  return Array.from(grouped.values());
}

function formatItemSignature(item) {
  const district = normalize(item.district);
  const neighborhood = normalize(item.neighborhood);
  const location = [district, neighborhood].filter(Boolean).join(" / ") || "-";
  const windowText = normalize(formatOutageWindow(item));
  const statusText = normalize(getStatusLabel(item));
  const reasonText = normalize(item.reason);
  return [location, windowText, statusText, reasonText].filter(Boolean).join(" | ");
}

function formatStatusBadge(statusText) {
  const text = normalize(statusText);
  if (!text) return "";
  return `\u{1F4CC} ${escapeHtml(text)}`;
}

function formatItemCard(item, count) {
  const districtRaw = normalize(item.district);
  const neighborhoodRaw = normalize(item.neighborhood);
  const locationText =
    [districtRaw, neighborhoodRaw].filter(Boolean).join(" / ") || "-";
  const location = escapeHtml(locationText);
  const windowText = escapeHtml(formatOutageWindow(item));
  const statusLine = formatStatusBadge(getStatusLabel(item));
  const reasonText = normalize(item.reason);
  const countTag = count > 1 ? `  \u{1F501} <b>x${count}</b>` : "";
  const lines = [`\u{1F4CD} <b>${location}</b>${countTag}`];

  const metaParts = [`\u{23F1}\u{FE0F} <b>${windowText}</b>`];
  if (statusLine) metaParts.push(statusLine);
  if (metaParts.length) lines.push(metaParts.join("  \u2022  "));
  if (reasonText) lines.push(`\u{1F4DD} ${escapeHtml(reasonText)}`);

  return lines.join("\n");
}

function getStatusLabel(item) {
  const status = normalize(item.status);
  const type = normalize(item.type);
  if (status && type && normalizeKeyPart(status) !== normalizeKeyPart(type)) {
    return `${status} / ${type}`;
  }
  return status || type || "";
}

function mergeSource(target, item) {
  const url = normalize(item.sourceUrl);
  if (!url) return;
  if (target.has(url)) return;
  const label = normalize(item.source) || "Resmi sayfa";
  target.set(url, label);
}

function formatOutageWindow(item) {
  const startParts = parseDateTimeParts(item.start);
  const endParts = parseDateTimeParts(item.end);

  if (startParts || endParts) {
    if (startParts && endParts) {
      if (startParts.date === endParts.date) {
        return `${startParts.date} ${startParts.time} - ${endParts.time}`;
      }
      return `${startParts.date} ${startParts.time} - ${endParts.date} ${endParts.time}`;
    }
    if (startParts) return `${startParts.date} ${startParts.time}`;
    return `${endParts.date} ${endParts.time}`;
  }

  const durationText = normalize(item.duration);
  if (!durationText) return "-";

  const derived = formatRangeFromText(durationText);
  return derived || durationText;
}

function parseDateTimeParts(value) {
  if (!value) return null;
  const text = normalize(value);
  if (!text) return null;

  let match = text.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (match) {
    const year = match[1];
    const month = match[2];
    const day = match[3];
    const hour = match[4];
    const minute = match[5];
    if (!isValidDateParts(year, month, day, hour, minute)) return null;
    return { date: `${day}.${month}.${year}`, time: `${hour}:${minute}` };
  }

  match = text.match(/(\d{2})\.(\d{2})\.(\d{4}).*?(\d{2}):(\d{2})/);
  if (match) {
    const day = match[1];
    const month = match[2];
    const year = match[3];
    const hour = match[4];
    const minute = match[5];
    if (!isValidDateParts(year, month, day, hour, minute)) return null;
    return { date: `${day}.${month}.${year}`, time: `${hour}:${minute}` };
  }

  return null;
}

function isValidDateParts(year, month, day, hour, minute) {
  const yearNum = Number(year);
  const monthNum = Number(month);
  const dayNum = Number(day);
  const hourNum = Number(hour);
  const minuteNum = Number(minute);

  if (!Number.isFinite(yearNum) || yearNum < 1900) return false;
  if (!Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) return false;
  if (!Number.isFinite(dayNum) || dayNum < 1 || dayNum > 31) return false;
  if (!Number.isFinite(hourNum) || hourNum < 0 || hourNum > 23) return false;
  if (!Number.isFinite(minuteNum) || minuteNum < 0 || minuteNum > 59) {
    return false;
  }
  return true;
}

function formatRangeFromText(text) {
  const match = text.match(/(\d{2})\.(\d{2})\.(\d{4}).*?(\d{2}:\d{2}).*?(\d{2}:\d{2})/);
  if (!match) return "";
  const day = match[1];
  const month = match[2];
  const year = match[3];
  const start = match[4];
  const end = match[5];
  if (!isValidDateParts(year, month, day, start.slice(0, 2), start.slice(3, 5))) {
    return "";
  }
  return `${day}.${month}.${year} ${start} - ${end}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildInlineKeyboardForSources(sources) {
  if (!sources || sources.size === 0) return null;
  const rows = [];
  let row = [];

  for (const [url, label] of sources.entries()) {
    if (!url || !/^https?:/i.test(url)) continue;
    row.push({
      text: label || "Resmi sayfa",
      url
    });
    if (row.length === 2) {
      rows.push(row);
      row = [];
    }
  }

  if (row.length) rows.push(row);
  if (!rows.length) return null;
  return { inline_keyboard: rows };
}

async function fetchProviderItems(provider) {
  const requestOptions = buildRequestOptions(provider.request);
  const useLegacyHttp = toBool(provider.request && provider.request.legacyHttp);
  const isUedas =
    provider.id === "bursa-uedas-electric" ||
    /edrimsapi\.uedas\.com\.tr/i.test(provider.url || "");
  const useCurl = toBool(provider.request && provider.request.useCurl) || isUedas;
  const allowCurlFallback = !useCurl;
  const fetchTextFn = useCurl
    ? fetchTextCurl
    : useLegacyHttp
      ? fetchTextLegacy
      : fetchText;
  const fetchJsonFn = useCurl
    ? fetchJsonCurl
    : useLegacyHttp
      ? fetchJsonLegacy
      : fetchJson;
  const fetchTextWithFallback = (url, timeoutMs, options) =>
    fetchWithCurlFallback(
      fetchTextFn,
      fetchTextCurl,
      url,
      timeoutMs,
      options,
      allowCurlFallback
    );
  const fetchJsonWithFallback = (url, timeoutMs, options) =>
    fetchWithCurlFallback(
      fetchJsonFn,
      fetchJsonCurl,
      url,
      timeoutMs,
      options,
      allowCurlFallback
    );

  if (provider.format === "html") {
    const html = await fetchTextWithFallback(
      provider.url,
      REQUEST_TIMEOUT_MS,
      requestOptions
    );
    return parseHtmlProvider(provider, html);
  }

  const data = await fetchJsonWithFallback(
    provider.url,
    REQUEST_TIMEOUT_MS,
    requestOptions
  );
  if (provider.parser) {
    const parsed = await parseJsonProvider(provider, data);
    if (Array.isArray(parsed)) return parsed;
  }

  const list = extractList(data, provider.listPath);
  return list.map((raw) => mapItem(raw, provider));
}

function getPollModeAndMs() {
  if (FIXED_POLL_MS) {
    return { mode: "fixed", delayMs: FIXED_POLL_MS };
  }

  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const inPeak =
    (minutes >= 7 * 60 && minutes < 10 * 60) ||
    (minutes >= 17 * 60 && minutes < 22 * 60);
  const inNight = minutes >= 22 * 60 || minutes < 7 * 60;

  if (inPeak) return { mode: "peak", delayMs: PEAK_POLL_MS };
  if (inNight) return { mode: "night", delayMs: NIGHT_POLL_MS };
  return { mode: "normal", delayMs: NORMAL_POLL_MS };
}

function scheduleNext() {
  const { mode, delayMs } = getPollModeAndMs();
  if (timer) clearTimeout(timer);
  timer = setTimeout(tick, delayMs);
  console.log(`Next check in ${Math.round(delayMs / 60000)} min (mode: ${mode}).`);
}

function logProviderError(provider, err) {
  const message = err && err.message ? err.message : String(err);
  const cause = err && err.cause ? err.cause : null;
  console.error(`Provider ${provider.id} error: ${message}`);
  if (cause && cause.message) {
    console.error(`Provider ${provider.id} cause: ${cause.message}`);
  }
}

async function tick() {
  if (inFlight) {
    scheduleNext();
    return;
  }

  inFlight = true;
  try {
    let totalFound = 0;
    let totalSent = 0;
    let totalMessages = 0;
    const pendingByCity = new Map();

    for (const provider of providers) {
      let items = [];
      try {
        items = await fetchProviderItems(provider);
      } catch (err) {
        logProviderError(provider, err);
        continue;
      }

      totalFound += items.length;

      for (const item of items) {
        const legacyKey = buildLegacyDedupeKey(item);
        const key = buildDedupeKey(item) || legacyKey;
        if (!key) continue;
        const alreadySent =
          isSentStmt.get(key) ||
          (legacyKey && legacyKey !== key && isSentStmt.get(legacyKey));
        if (alreadySent) {
          if (legacyKey && legacyKey !== key && !isSentStmt.get(key)) {
            markSentStmt.run(key);
          }
          continue;
        }

        const cityLabel = normalizeCityLabel(item.city);
        const cityKey = normalizeKeyPart(cityLabel) || "bilinmeyen";
        let group = pendingByCity.get(cityKey);
        if (!group) {
          group = { city: cityLabel, items: [] };
          pendingByCity.set(cityKey, group);
        }
        group.items.push({ item, key });
      }
    }

    const groups = Array.from(pendingByCity.values()).sort((a, b) =>
      normalizeKeyPart(a.city).localeCompare(normalizeKeyPart(b.city))
    );

    for (const group of groups) {
      const messages = formatCityMessages(group);
      const topicId = getTopicIdForCity(group.city);
      for (const messageGroup of messages) {
        const keyboard = buildInlineKeyboardForSources(messageGroup.sources);
        const options = { parse_mode: "HTML" };
        if (topicId) options.message_thread_id = topicId;
        if (keyboard) options.reply_markup = keyboard;

        if (DRY_RUN) {
          console.log(
            `[DRY_RUN] Would send (${group.city}):\n${messageGroup.text}`
          );
          for (const key of messageGroup.keys) {
            markSentStmt.run(key);
            totalSent += 1;
          }
          totalMessages += 1;
          continue;
        }

        try {
          await bot.telegram.sendMessage(CHANNEL_ID, messageGroup.text, options);
          for (const key of messageGroup.keys) {
            markSentStmt.run(key);
            totalSent += 1;
          }
          totalMessages += 1;
        } catch (err) {
          const errorMessage = err && err.message ? err.message : String(err);
          console.error(`Send error (${group.city}):`, errorMessage);
          if (err && err.cause && err.cause.message) {
            console.error(`Send cause (${group.city}):`, err.cause.message);
          }
        }
      }
    }

    console.log(
      `Tick done. Found: ${totalFound}. Sent: ${totalSent}. Messages: ${totalMessages}.`
    );
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    const cause = err && err.cause ? err.cause : null;
    console.error("Tick error:", message);
    if (cause && cause.message) {
      console.error("Cause:", cause.message);
    }
  } finally {
    inFlight = false;
    scheduleNext();
  }
}

(async () => {
  console.log("Bot starting.");
  await tick();
})();
