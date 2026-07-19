import * as v from "valibot";
import type { CinderClient } from "../client.js";

/**
 * Schema for the cinder_crawl tool parameters.
 */
export const CrawlSchema = v.object({
  url: v.pipe(
    v.string(),
    v.description("The root URL to start crawling from"),
    v.url("Must be a valid URL"),
  ),
  render: v.optional(v.boolean(), false),
  screenshot: v.optional(v.boolean(), false),
  images: v.optional(v.boolean(), false),
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
});

export type CrawlInput = v.InferOutput<typeof CrawlSchema>;

/**
 * Handler for the cinder_crawl tool.
 * Enqueues an asynchronous crawl job and returns a task ID for polling.
 */
export function createCrawlHandler(client: CinderClient) {
  return async (input: Record<string, unknown>) => {
    const { url, render, screenshot, images, maxDepth, limit } = input as any;
    try {
      const result = await client.crawl({
        url,
        render,
        screenshot,
        images,
        maxDepth,
        limit,
      });

      const text = [
        "# Crawl Job Enqueued",
        "",
        `**URL:** ${result.url}`,
        `**Task ID:** \`${result.id}\``,
        `**Render:** ${result.render}`,
        "",
        "---",
        "",
        "Use `cinder_crawl_status` with the task ID above to check progress.",
        "The crawl runs asynchronously — poll until state is `completed` or `failed`.",
      ].join("\n");

      return {
        content: [{ type: "text" as const, text }],
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
