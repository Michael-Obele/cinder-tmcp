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
        "You have access to the Cinder web scraping API through MCP tools.",
        "",
        "## Available Tools",
        "",
        "### `cinder_scrape`",
        "Scrape a single webpage and get clean, LLM-ready markdown content.",
        "- Supports smart (auto-detect), static (fast), and dynamic (JS rendering) modes.",
        "- Optionally capture screenshots or extract images.",
        "- Best for: single page extraction, RAG pipelines, content analysis.",
        "",
        "### `cinder_crawl`",
        "Asynchronously crawl an entire website with BFS link-following.",
        "- Returns a task ID — use `cinder_crawl_status` to poll for results.",
        "- Configurable depth (1-10) and page limit (1-100).",
        "- Best for: documentation sites, blogs, multi-page content gathering.",
        "",
        "### `cinder_crawl_status`",
        "Check the status of an async crawl job.",
        "- States: pending → active → completed/failed.",
        "- Returns results as JSON when completed.",
        "",
        "### `cinder_search`",
        "Search the web using Brave Search API proxied through Cinder.",
        "- Supports pagination, domain filtering, and result limiting.",
        "- Best for: finding relevant pages, research, discovering URLs to scrape.",
        "",
        "## Best Practices",
        "- For single-page content, use `cinder_scrape` directly.",
        "- For multi-page sites, use `cinder_crawl` and poll with `cinder_crawl_status`.",
        "- Use `cinder_search` first to discover relevant pages, then scrape them.",
        "- Crawl jobs are async — always poll until state is `completed` or `failed`.",
      ].join("\n"),
    },
  );

  // Register tool: cinder_scrape
  server.tool(
    {
      name: "cinder_scrape",
      description: "Scrape a single webpage and return clean markdown content",
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
        "Enqueue a URL for asynchronous crawling (returns task ID for polling)",
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
      description: "Get the status and results of an asynchronous crawl job",
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
      description: "Search the web using Brave Search API",
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
