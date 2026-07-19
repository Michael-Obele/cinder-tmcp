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
 * Handler for the cinder_crawl_status tool.
 * Polls for the status of an asynchronous crawl job.
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
      if (result.max_retry !== undefined)
        lines.push(`**Max Retries:** ${result.max_retry}`);
      if (result.retried !== undefined)
        lines.push(`**Retried:** ${result.retried}`);

      if (result.state === "completed" && result.result) {
        lines.push(
          "",
          "---",
          "## Results",
          "",
          "```json",
          result.result,
          "```",
        );
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
