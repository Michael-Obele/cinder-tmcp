import * as v from "valibot";
import type { CinderClient, CrawlParams } from "../client.js";

/**
 * Schema for the cinder_crawl tool parameters.
 * Mirrors the Cinder `CrawlRequest` (handlers.CrawlRequest) from the swagger.
 */
export const CrawlSchema = v.object({
  url: v.pipe(
    v.string(),
    v.description("The root URL to start crawling from"),
    v.url("Must be a valid URL"),
  ),
  mode: v.optional(
    v.pipe(
      v.picklist(["smart", "static", "dynamic"]),
      v.description("Scraping mode per page: smart, static, or dynamic"),
    ),
    "smart",
  ),
  render: v.optional(
    v.pipe(
      v.boolean(),
      v.description("Render JavaScript for each page (headless browser)"),
    ),
    false,
  ),
  screenshot: v.optional(v.boolean(), false),
  images: v.optional(v.boolean(), false),
  image_format: v.optional(
    v.pipe(
      v.picklist(["url", "blob"]),
      v.description(
        "Image transport: 'url' (metadata only) or 'blob' (base64)",
      ),
    ),
    "url",
  ),
  maxDepth: v.optional(
    v.pipe(
      v.number(),
      v.minValue(1),
      v.maxValue(10),
      v.description("Maximum crawl depth (1-10)"),
    ),
    2,
  ),
  limit: v.optional(
    v.pipe(
      v.number(),
      v.minValue(1),
      v.maxValue(100),
      v.description("Maximum number of pages to crawl (1-100)"),
    ),
    10,
  ),
  include_paths: v.optional(
    v.pipe(
      v.array(v.string()),
      v.description(
        "Only follow links whose path matches these globs (e.g. ['/blog/*'])",
      ),
    ),
  ),
  exclude_paths: v.optional(
    v.pipe(
      v.array(v.string()),
      v.description(
        "Never follow links whose path matches these globs (exclusion wins)",
      ),
    ),
  ),
  webhook_url: v.optional(
    v.pipe(
      v.string(),
      v.description("POST the crawl result here on completion"),
    ),
  ),
  webhook_secret: v.optional(
    v.pipe(
      v.string(),
      v.description("HMAC-SHA256 key for the X-Cinder-Signature header"),
    ),
  ),
});

export type CrawlInput = v.InferOutput<typeof CrawlSchema>;

/**
 * Handler for the cinder_crawl tool.
 * Enqueues an asynchronous crawl job and returns a task ID for polling.
 */
export function createCrawlHandler(client: CinderClient) {
  return async (input: Record<string, unknown>) => {
    const params = input as unknown as CrawlParams;
    try {
      const result = await client.crawl(params);

      const lines: string[] = [
        "# Crawl Job Enqueued",
        "",
        `**URL:** ${result.url}`,
        `**Task ID:** \`${result.id}\``,
        `**Render:** ${result.render}`,
        `**Screenshot:** ${result.screenshot}`,
        `**Images:** ${result.images}`,
        `**Max Depth:** ${result.maxDepth}`,
        `**Limit:** ${result.limit}`,
      ];
      if (result.image_format) {
        lines.push(`**Image Format:** ${result.image_format}`);
      }

      lines.push(
        "",
        "---",
        "",
        "Use `cinder_crawl_status` with the task ID above to check progress.",
        "The crawl runs asynchronously — poll until state is `completed` or `failed`.",
      );

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return {
        content: [{ type: "text" as const, text: `Crawl failed: ${message}` }],
        isError: true,
      };
    }
  };
}
