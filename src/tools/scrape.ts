import * as v from "valibot";
import type { CinderClient } from "../client.js";

/**
 * Schema for the cinder_scrape tool parameters.
 * Validates input using Valibot with URL validation and sensible defaults.
 */
export const ScrapeSchema = v.object({
  url: v.pipe(
    v.string(),
    v.description("The URL to scrape"),
    v.url("Must be a valid URL"),
  ),
  mode: v.optional(
    v.pipe(
      v.picklist(["smart", "static", "dynamic"]),
      v.description(
        "Scraping mode: smart (auto), static (colly), dynamic (chromedp)",
      ),
    ),
    "smart",
  ),
  screenshot: v.optional(v.boolean(), false),
  images: v.optional(v.boolean(), false),
});

export type ScrapeInput = v.InferOutput<typeof ScrapeSchema>;

/**
 * Handler for the cinder_scrape tool.
 * Scrapes a URL and returns clean markdown content.
 */
export function createScrapeHandler(client: CinderClient) {
  return async (input: Record<string, unknown>) => {
    const { url, mode, screenshot, images } = input as any;
    try {
      const result = await client.scrape({ url, mode, screenshot, images });

      let text = `# Scrape Result\n\n**URL:** ${result.url}\n\n`;
      text += `**Engine:** ${result.metadata.engine}\n`;
      text += `**Scraped at:** ${result.metadata.scraped_at}\n\n`;
      text += `---\n\n${result.markdown}`;

      return {
        content: [{ type: "text" as const, text }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return {
        content: [{ type: "text" as const, text: `Scrape failed: ${message}` }],
        isError: true,
      };
    }
  };
}
