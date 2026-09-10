import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { fetch, ProxyAgent } from "undici";
import { sanitizeHtmlJSDOM } from "./image-processor.js";
import dns from "node:dns";

// Force IPv4-first DNS resolution to avoid ENETUNREACH on broken IPv6
try {
  dns.setDefaultResultOrder("ipv4first");
} catch (e) {
  console.warn("[WARN] Failed to set DNS result order to ipv4first:", e.message);
}
/**
 * Custom error that carries a semantic error type.
 */
export class ExtractionError extends Error {
  /**
   * @param {string} type        – semantic error type (e.g. "DNS_ERROR")
   * @param {string} message     – human‑readable description
   * @param {Error} [cause]      – optional original error (preserved for debugging)
   */
  constructor(type, message, cause) {
    super(message);
    this.name = "ExtractionError";
    this.type = type;
    this.cause = cause || null;
    if (typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(this, ExtractionError);
    }
  }
}

/** Map low‑level fetch/Undici error codes to semantic error types. */
function mapErrorCodeToType(code) {
  const map = {
    ENOTFOUND: "DNS_ERROR",
    ECONNREFUSED: "CONNECT_FAILED",
    ETIMEDOUT: "TIMEOUT_ERROR",
    PROXY_AUTH_FAILED: "PROXY_ERROR",
    HANDSHAKE_TIMEOUT: "CONNECT_TIMEOUT",
    TLS_ERROR: "TLS_ERROR",
  };
  return map[code] || "EXTRACTION_FAILED";
}

/**
 * Core extraction routine – fetches a URL, runs Readability on the HTML,
 * and returns the parsed article object.
 *
 * @param {string} url – the article URL to extract
 * @returns {Promise<Object>} – article data (title, content, tags, …)
 * @throws {ExtractionError} – if any step fails
 */
export async function extractArticle(url) {
  // -----------------------------------------------------------------
  // 1️⃣  Basic URL validation
  // -----------------------------------------------------------------
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new ExtractionError("INVALID_INPUT", "Please provide a valid URL string.", null);
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new ExtractionError(
      "INVALID_INPUT",
      "Only HTTP and HTTPS URLs are supported.",
      null,
    );
  }

  // -----------------------------------------------------------------
  // 2️⃣  Download the page (small timeout + optional proxy via env var)
  // -----------------------------------------------------------------
// Use a proxy only when the deployment explicitly configures one.
const proxyUrl = process.env.PROXY_URL;

console.log("[DEBUG] Using proxy:", proxyUrl || "none");
console.log("[DEBUG] Fetching URL:", parsedUrl.href);

const requestOptions = {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "en-GB,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Sec-Ch-Ua": "\"Google Chrome\"\;v=\"131\", \"Chromium\"\;v=\"131\", \"Not_A Brand\"\;v=\"24\"",
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": "\"Windows\"",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
  },
  signal: AbortSignal.timeout(60000),
  maxRedirections: 20,
};

if (proxyUrl) requestOptions.dispatcher = new ProxyAgent(proxyUrl);

let response;
  let html;
  try {
    response = await fetch(parsedUrl.href, requestOptions);
    
    if (!response.ok) {
      throw new ExtractionError("NETWORK_ERROR", `HTTP ${response.status}`, null);
    }

    // Check if we got a valid HTML response (not an error page from proxy)
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      console.warn("[WARN] Unexpected content-type:", contentType);
    }

    html = await response.text();
  } catch (fetchErr) {
    console.error("[ERROR] Fetch failed:");
    console.error("[ERROR] URL:", parsedUrl.href);
    console.error("[ERROR] Proxy:", proxyUrl || "none");
    console.error("[ERROR] Cause:", fetchErr.cause?.message || fetchErr.message);
    console.error("[ERROR] Cause code:", fetchErr.cause?.code || fetchErr.code);
    if (fetchErr.cause?.errors) {
      console.error("[ERROR] Aggregate errors:");
      fetchErr.cause.errors.forEach((e, i) => {
        console.error(`  [${i}] ${e.code}: ${e.message} (${e.syscall} ${e.address}:${e.port})`);
      });
    }
    
    // Map common proxy/connection errors
    const errCode = fetchErr.cause?.code || fetchErr.code;
    const errType = mapErrorCodeToType(errCode);
    throw new ExtractionError(errType, fetchErr.message, fetchErr);
  }

console.log("[DEBUG] Response status:", response.status);
console.log("[DEBUG] HTML length:", html.length);

  // -----------------------------------------------------------------
  // 3️⃣  Run Mozilla Readability
  // -----------------------------------------------------------------
const dom = new JSDOM(html, {
  url: parsedUrl.href,
});

const readability = new Readability(
  dom.window.document,
  {
    debug: false,
  }
);

const article = readability.parse();

if (!article) {
  throw new ExtractionError(
    "PARSE_FAILED",
    "Readability could not parse the article",
    null
  );
}

// -----------------------------------------------------------------
// 4️⃣  Post-process images: remove placeholders, upgrade srcset, etc.
// -----------------------------------------------------------------
// Create a temporary DOM to process the article content
const contentDom = new JSDOM(article.content, {
  url: parsedUrl.href,
});
sanitizeHtmlJSDOM(contentDom.window.document);
article.content = contentDom.window.document.body.innerHTML;

return article;

}
