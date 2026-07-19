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
        "Cinder MCP exposes web scraping (scrape/crawl/search) via the Cinder API.",
        "",
        "## Tools at a Glance",
        "- `cinder_scrape` — scrape single page (smart/static/dynamic), optional screenshots",
        "- `cinder_crawl` — async BFS crawl, returns task ID, poll with cinder_crawl_status",
        "- `cinder_crawl_status` — poll crawl job (pending→active→completed/failed)",
        "- `cinder_search` — web search via Brave, supports domain filters & pagination",
        "",
        "## Tips",
        "- Use `cinder_search` first to discover URLs, then scrape them.",
        "- Crawl jobs are async — always poll until state is `completed` or `failed`.",
      ].join("\n"),
    },
  );

  // Register tool: cinder_scrape
  server.tool(
    {
      name: "cinder_scrape",
      description: "Scrape a single webpage into clean markdown",
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
      description: "Asynchronously crawl a website (returns task ID — poll with cinder_crawl_status)",
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
      description: "Search the web via Brave (domain filters, pagination)",
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

  return server;
}
