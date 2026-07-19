import { getConfig } from "./config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScrapeParams {
  url: string;
  mode?: "smart" | "static" | "dynamic";
  screenshot?: boolean;
  images?: boolean;
}

export interface ScrapeResult {
  url: string;
  markdown: string;
  html?: string;
  metadata: {
    scraped_at: string;
    engine: string;
  };
  screenshot?: string;
  images?: string[];
}

export interface CrawlParams {
  url: string;
  render?: boolean;
  screenshot?: boolean;
  images?: boolean;
  maxDepth?: number;
  limit?: number;
}

export interface CrawlResponse {
  id: string;
  url: string;
  render: boolean;
}

export interface CrawlStatusResponse {
  id: string;
  state: "pending" | "active" | "completed" | "failed" | "retry";
  payload?: string;
  result?: string;
  queue?: string;
  max_retry?: number;
  retried?: number;
}

export interface SearchParams {
  query: string;
  offset?: number;
  limit?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
}

export interface SearchResult {
  title: string;
  url: string;
  description: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  hasMore: boolean;
  nextOffset: number;
  count: number;
}

// ---------------------------------------------------------------------------
// SSRF Prevention
// ---------------------------------------------------------------------------

/**
 * Validate a URL to prevent Server-Side Request Forgery attacks.
 * Blocks private IPs, localhost, and non-HTTP(S) protocols.
 */
function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Must be HTTP or HTTPS
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }

    // Block private/internal hosts
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname.startsWith("10.") ||
      hostname.startsWith("172.16.") ||
      hostname.startsWith("192.168.") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal")
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Cinder API Client
// ---------------------------------------------------------------------------

/**
 * Timeout configuration per endpoint type (milliseconds).
 */
export const CINDER_TIMEOUT = {
  scrape: 30_000,
  crawl: 10_000,
  crawlStatus: 5_000,
  search: 15_000,
} as const;

/**
 * HTTP client for the Cinder API.
 * Wraps all Cinder endpoints with type-safe methods, error handling, and SSRF prevention.
 */
export class CinderClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    const config = getConfig();
    this.baseUrl = config.CINDER_API_URL.replace(/\/+$/, "");
    this.apiKey = config.CINDER_API_KEY;
  }

  private get headers(): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      h["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return h;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    timeout?: number,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = timeout
      ? setTimeout(() => controller.abort(), timeout)
      : null;

    try {
      const response = await fetch(url, {
        method,
        headers: this.headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new CinderError(
          `Cinder API error: ${response.status} ${response.statusText}`,
          response.status,
          errorBody,
        );
      }

      return (await response.json()) as T;
    } catch (err) {
      if (err instanceof CinderError) throw err;
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new CinderError(`Request timed out after ${timeout}ms`, 408, "");
      }
      throw new CinderError(
        err instanceof Error ? err.message : "Unknown error",
        0,
        "",
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Scrape a single webpage.
   * POST /v1/scrape
   */
  async scrape(params: ScrapeParams): Promise<ScrapeResult> {
    if (!validateUrl(params.url)) {
      throw new CinderError(
        "Invalid or blocked URL. Only HTTP(S) URLs to public hosts are allowed.",
        400,
        "",
      );
    }
    return this.request<ScrapeResult>(
      "POST",
      "/v1/scrape",
      params,
      CINDER_TIMEOUT.scrape,
    );
  }

  /**
   * Enqueue an asynchronous crawl job.
   * POST /v1/crawl
   */
  async crawl(params: CrawlParams): Promise<CrawlResponse> {
    if (!validateUrl(params.url)) {
      throw new CinderError(
        "Invalid or blocked URL. Only HTTP(S) URLs to public hosts are allowed.",
        400,
        "",
      );
    }
    return this.request<CrawlResponse>(
      "POST",
      "/v1/crawl",
      params,
      CINDER_TIMEOUT.crawl,
    );
  }

  /**
   * Get crawl job status.
   * GET /v1/crawl/:id
   */
  async getCrawlStatus(id: string): Promise<CrawlStatusResponse> {
    return this.request<CrawlStatusResponse>(
      "GET",
      `/v1/crawl/${encodeURIComponent(id)}`,
      undefined,
      CINDER_TIMEOUT.crawlStatus,
    );
  }

  /**
   * Search the web via Brave Search API.
   * POST /v1/search
   */
  async search(params: SearchParams): Promise<SearchResponse> {
    return this.request<SearchResponse>(
      "POST",
      "/v1/search",
      params,
      CINDER_TIMEOUT.search,
    );
  }
}

// ---------------------------------------------------------------------------
// Custom Error
// ---------------------------------------------------------------------------

export class CinderError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = "CinderError";
  }
}
