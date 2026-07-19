import * as v from "valibot";
import type { CinderClient } from "../client.js";

/**
 * Schema for the cinder_search tool parameters.
 */
export const SearchSchema = v.object({
  query: v.pipe(
    v.string(),
    v.description("The search query"),
    v.minLength(1, "Search query cannot be empty"),
  ),
  offset: v.optional(
    v.pipe(
      v.number(),
      v.minValue(0),
      v.description("Pagination offset for results"),
    ),
    0,
  ),
  limit: v.optional(
    v.pipe(
      v.number(),
      v.minValue(1),
      v.maxValue(100),
      v.description("Number of results to return (1-100)"),
    ),
    10,
  ),
  includeDomains: v.optional(v.array(v.string())),
  excludeDomains: v.optional(v.array(v.string())),
});

export type SearchInput = v.InferOutput<typeof SearchSchema>;

/**
 * Handler for the cinder_search tool.
 * Searches the web via Brave Search API proxied through Cinder.
 */
export function createSearchHandler(client: CinderClient) {
  return async (input: Record<string, unknown>) => {
    const { query, offset, limit, includeDomains, excludeDomains } =
      input as any;
    try {
      const result = await client.search({
        query,
        offset,
        limit,
        includeDomains,
        excludeDomains,
      });

      const lines: string[] = [
        `# Search Results: "${result.query}"`,
        "",
        `Found ${result.count} results${result.hasMore ? " (more available)" : ""}`,
        "",
      ];

      for (const item of result.results) {
        lines.push(`### ${item.title}`);
        lines.push("");
        lines.push(`${item.description}`);
        lines.push("");
        lines.push(`🔗 ${item.url}`);
        lines.push("");
        lines.push("---");
        lines.push("");
      }

      if (result.hasMore) {
        lines.push(
          "",
          `Use \`offset: ${result.nextOffset}\` to get the next page of results.`,
        );
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return {
        content: [{ type: "text" as const, text: `Search failed: ${message}` }],
        isError: true,
      };
    }
  };
}
