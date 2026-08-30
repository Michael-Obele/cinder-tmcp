import { McpServer } from "tmcp";
import { ValibotJsonSchemaAdapter } from "@tmcp/adapter-valibot";
import { getConfig } from "./config.js";
import { CinderClient } from "./client.js";
import { ScrapeSchema, createScrapeHandler } from "./tools/scrape.js";
import { CrawlSchema, createCrawlHandler } from "./tools/crawl.js";
import {
  CrawlStatusSchema,
  createCrawlStatusHandler,
} from "./tools/crawl-status.js";
import { SearchSchema, createSearchHandler } from "./tools/search.js";
import { MonitorSchema, createMonitorHandler } from "./tools/monitor.js";

/**
 * Create and configure the McpServer instance.
 * Registers all Cinder MCP tools with Valibot-validated schemas.
 */
export function createServer(): McpServer {
  const config = getConfig();
  const client = new CinderClient();

  const server = new McpServer(
    {
      name: config.MCP_SERVER_NAME,
      version: config.MCP_SERVER_VERSION,
      description:
        "Cinder MCP — web scraping, crawling, and search powered by Cinder API",
    },
    {
      adapter: new ValibotJsonSchemaAdapter(),
      capabilities: {
        tools: { listChanged: false },
      },
      instructions: [
        "Cinder MCP exposes web scraping, crawling, search, and change-tracking via the Cinder API.",
        "",
        "## Tools at a Glance",
        "- `cinder_scrape` — scrape a single page (smart/static/dynamic), optional screenshots, images, summary, schema extraction",
        "- `cinder_crawl` — async BFS crawl, returns task ID, poll with cinder_crawl_status",
        "- `cinder_crawl_status` — poll crawl job (pending→active→completed/failed)",
        "- `cinder_search` — web search via SearXNG (Brave fallback), supports domain filters, requiredText, maxAge, pagination",
        "- `cinder_monitor` — create/check/delete a change-tracking monitor (use the `action` field)",
        "",
        "## Tips",
        "- Use `cinder_search` first to discover URLs, then scrape them.",
        "- Crawl and monitor jobs are async — poll their status tools until done.",
        "- Async tools (crawl, monitor) require a Redis-backed Cinder instance.",
      ].join("\n"),
    },
  );

  // Register tool: cinder_scrape
  server.tool(
    {
      name: "cinder_scrape",
      description:
        "Scrape a single webpage into clean markdown (smart/static/dynamic), with optional screenshots, images, summary, and schema extraction",
      schema: ScrapeSchema,
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        idempotentHint: true,
        destructiveHint: false,
      },
    },
    createScrapeHandler(client) as any,
  );

  // Register tool: cinder_crawl
  server.tool(
    {
      name: "cinder_crawl",
      description:
        "Asynchronously crawl a website (returns task ID — poll with cinder_crawl_status)",
      schema: CrawlSchema,
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        idempotentHint: false,
        destructiveHint: false,
      },
    },
    createCrawlHandler(client) as any,
  );

  // Register tool: cinder_crawl_status
  server.tool(
    {
      name: "cinder_crawl_status",
      description: "Poll a crawl job for status and results",
      schema: CrawlStatusSchema,
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
        idempotentHint: true,
        destructiveHint: false,
      },
    },
    createCrawlStatusHandler(client) as any,
  );

  // Register tool: cinder_search
  server.tool(
    {
      name: "cinder_search",
      description: "Search the web via SearXNG with Brave fallback (domain filters, pagination)",
      schema: SearchSchema,
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        idempotentHint: true,
        destructiveHint: false,
      },
    },
    createSearchHandler(client) as any,
  );

  // Register tool: cinder_monitor (create / status / delete via `action`)
  server.tool(
    {
      name: "cinder_monitor",
      description:
        "Manage change-tracking monitors. Set `action` to 'create' (hashes markdown, fires a signed webhook on change), 'status' (get config, last hash, next check), or 'delete' (stop and remove).",
      schema: MonitorSchema,
      annotations: {
        readOnlyHint: false,
        openWorldHint: true,
        idempotentHint: false,
        destructiveHint: false,
      },
    },
    createMonitorHandler(client) as any,
  );

  return server;
}
