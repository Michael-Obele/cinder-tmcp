import * as v from "valibot";
import type { CinderClient, ScrapeParams } from "../client.js";

/**
 * Schema for the cinder_scrape tool parameters.
 * Mirrors the Cinder `ScrapeRequest` (handlers.ScrapeRequest) from the swagger.
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
  screenshot: v.optional(
    v.pipe(
      v.boolean(),
      v.description("Capture a screenshot (needs dynamic/smart)"),
    ),
    false,
  ),
  screenshot_opts: v.optional(
    v.pipe(
      v.object({
        width: v.optional(v.number()),
        height: v.optional(v.number()),
        full_page: v.optional(v.boolean()),
        format: v.optional(v.picklist(["jpeg", "png"])),
        quality: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(100))),
        wait_selector: v.optional(v.string()),
      }),
      v.description(
        "Screenshot configuration (width, height, full_page, format, quality, wait_selector)",
      ),
    ),
  ),
  images: v.optional(
    v.pipe(v.boolean(), v.description("Extract images from the page")),
    false,
  ),
  image_format: v.optional(
    v.pipe(
      v.picklist(["url", "blob"]),
      v.description(
        "Image transport: 'url' (metadata only) or 'blob' (base64)",
      ),
    ),
    "url",
  ),
  max_images: v.optional(
    v.pipe(
      v.number(),
      v.minValue(1),
      v.maxValue(50),
      v.description("Max images to extract (default 10)"),
    ),
    10,
  ),
  max_image_size_kb: v.optional(
    v.pipe(
      v.number(),
      v.minValue(1),
      v.description("Max individual image size in KB (default 5120)"),
    ),
    5120,
  ),
  image_process: v.optional(
    v.pipe(
      v.object({
        format: v.optional(v.picklist(["jpeg", "png"])),
        max_width: v.optional(v.number()),
        quality: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(100))),
      }),
      v.description(
        "Resize/re-encode image blobs (format, max_width, quality)",
      ),
    ),
  ),
  actions: v.optional(
    v.pipe(
      v.array(
        v.object({
          type: v.picklist([
            "wait_ms",
            "wait_selector",
            "click",
            "scroll_down",
            "scroll_to_bottom",
          ]),
          ms: v.optional(v.number()),
          selector: v.optional(v.string()),
        }),
      ),
      v.description("Page interactions before capture (dynamic mode only)"),
    ),
  ),
  extract_schema: v.optional(
    v.pipe(
      v.record(
        v.string(),
        v.object({
          selector: v.string(),
          attr: v.optional(v.string()),
          multiple: v.optional(v.boolean()),
        }),
      ),
      v.description(
        "Deterministic CSS-selector extraction: {field: {selector, attr?, multiple?}}",
      ),
    ),
  ),
  summary: v.optional(
    v.pipe(v.boolean(), v.description("Return an extractive summary (no LLM)")),
    false,
  ),
  summary_sentences: v.optional(
    v.pipe(
      v.number(),
      v.minValue(1),
      v.maxValue(50),
      v.description("Sentence count for the summary (default 5)"),
    ),
    5,
  ),
  redact_pii: v.optional(
    v.pipe(
      v.boolean(),
      v.description("Mask emails, phones, and card-shaped numbers"),
    ),
    false,
  ),
  block_ads: v.optional(
    v.pipe(
      v.boolean(),
      v.description("Strip ad/tracker containers before conversion"),
    ),
    true,
  ),
  remove_base64_images: v.optional(
    v.pipe(
      v.boolean(),
      v.description("Drop inline data: images before conversion"),
    ),
    true,
  ),
  /** @deprecated Use `mode: "dynamic"` instead. */
  render: v.optional(
    v.pipe(v.boolean(), v.description("Deprecated: behaves like mode=dynamic")),
    false,
  ),
});

export type ScrapeInput = v.InferOutput<typeof ScrapeSchema>;

/**
 * Handler for the cinder_scrape tool.
 * Scrapes a URL and returns clean markdown content plus optional extras.
 */
export function createScrapeHandler(client: CinderClient) {
  return async (input: Record<string, unknown>) => {
    const params = input as unknown as ScrapeParams;
    try {
      const result = await client.scrape(params);

      // Extract title from first markdown heading
      const titleMatch = result.markdown.match(/^#\s+(.+)/m);
      const title = titleMatch ? titleMatch[1].trim() : result.url;
      const wordCount = result.markdown.split(/\s+/).length;

      const lines: string[] = [
        `# Scrape Result: ${title}`,
        "",
        `**URL:** ${result.url}`,
        `**Words:** ${wordCount.toLocaleString()}`,
      ];

      if (result.summary) {
        lines.push("", "## Summary", "", result.summary);
      }

      if (result.extracted && Object.keys(result.extracted).length > 0) {
        lines.push("", "## Extracted", "");
        for (const [key, value] of Object.entries(result.extracted)) {
          const rendered =
            typeof value === "string" ? value : JSON.stringify(value);
          lines.push(`- **${key}:** ${rendered}`);
        }
      }

      lines.push("", "---", "", result.markdown);

      if (result.images && result.images.length > 0) {
        lines.push("", "---", "", `## Images (${result.images.length})`, "");
        for (const img of result.images) {
          const label =
            img.alt || img.title || img.source || img.url || "image";
          if (img.url) {
            lines.push(`- [${label}](${img.url})`);
          } else if (img.blob) {
            lines.push(
              `- ${label} (base64 ${img.format ?? ""}${img.size_bytes ? `, ${img.size_bytes} bytes` : ""})`,
            );
          } else {
            lines.push(`- ${label}`);
          }
        }
      }

      if (result.screenshot) {
        lines.push("", "## Screenshot", "");
        if (result.screenshot.url) {
          lines.push(`- [screenshot](${result.screenshot.url})`);
        } else if (result.screenshot.blob) {
          lines.push(
            `- screenshot captured (base64 ${result.screenshot.format ?? ""}${result.screenshot.size_bytes ? `, ${result.screenshot.size_bytes} bytes` : ""})`,
          );
        }
      }

      if (result.metadata && Object.keys(result.metadata).length > 0) {
        lines.push("", "## Metadata", "");
        for (const [k, val] of Object.entries(result.metadata)) {
          lines.push(`- **${k}:** ${val}`);
        }
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
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
