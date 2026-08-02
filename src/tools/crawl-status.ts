import * as v from "valibot";
import type { CinderClient } from "../client.js";

/**
 * Schema for the cinder_crawl_status tool parameters.
 */
export const CrawlStatusSchema = v.object({
  id: v.pipe(
    v.string(),
    v.description("The task ID returned by cinder_crawl"),
    v.minLength(1, "Task ID is required"),
  ),
});

export type CrawlStatusInput = v.InferOutput<typeof CrawlStatusSchema>;

/**
 * Fallback heading for a crawl page. The backend omits `title` when the
 * page's markdown has no H1 heading, so derive a readable label from the URL.
 */
function pageTitle(page: { title?: string; url: string }): string {
  const title = page.title?.trim();
  if (title) return title;
  try {
    const path = new URL(page.url).pathname;
    const last = path.split("/").filter(Boolean).pop();
    if (last) return decodeURIComponent(last);
    return new URL(page.url).hostname;
  } catch {
    return page.url;
  }
}

/**
 * Handler for the cinder_crawl_status tool.
 * Polls for the status of an asynchronous crawl job. The Cinder API now
 * returns a structured `crawl` object (not a raw JSON `result` string).
 */
export function createCrawlStatusHandler(client: CinderClient) {
  return async (input: Record<string, unknown>) => {
    const { id } = input as any;
    try {
      const result = await client.getCrawlStatus(id);

      const lines: string[] = [
        "# Crawl Status",
        "",
        `**Task ID:** \`${result.id}\``,
        `**State:** ${result.state}`,
      ];

      if (result.queue) lines.push(`**Queue:** ${result.queue}`);

      if (result.state === "completed" && result.crawl) {
        const c = result.crawl;
        lines.push(
          "",
          "---",
          `## Results (${c.status}, ${c.total_pages} pages, max depth: ${c.max_depth}, limit: ${c.limit})`,
          "",
        );

        for (const page of c.pages) {
          lines.push(`### ${pageTitle(page)}`);
          lines.push(`🔗 ${page.url}`);
          if (page.preview) {
            lines.push("", `> ${page.preview}`, "");
          }
          lines.push("");
        }

        if (c.failed_urls && c.failed_urls.length > 0) {
          lines.push("### Failed URLs", "");
          for (const f of c.failed_urls) {
            lines.push(`- ${f.url}: ${f.error}`);
          }
        }
      } else if (
        result.state === "failed" &&
        result.failed_urls &&
        result.failed_urls.length > 0
      ) {
        lines.push("", "---", "### Failed URLs", "");
        for (const f of result.failed_urls) {
          lines.push(`- ${f.url}: ${f.error}`);
        }
      }

      if (result.state === "failed") {
        lines.push(
          "",
          "---",
          "⚠️ The crawl job failed. Try again with a different URL or fewer pages.",
        );
      }

      if (result.state === "pending" || result.state === "active") {
        lines.push(
          "",
          "---",
          "⏳ The crawl is still in progress. Check back later.",
        );
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return {
        content: [
          {
            type: "text" as const,
            text: `Failed to get crawl status: ${message}`,
          },
        ],
        isError: true,
      };
    }
  };
}
