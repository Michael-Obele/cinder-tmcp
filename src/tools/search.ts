import * as v from "valibot";
import type { CinderClient, SearchParams } from "../client.js";

/**
 * Schema for the cinder_search tool parameters.
 * Mirrors the Cinder `SearchRequest` (handlers.SearchRequest) from the swagger.
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
  mode: v.optional(
    v.pipe(
      v.picklist(["fast"]),
      v.description(
        "Search speed: 'fast' restricts to recent results (last day)",
      ),
    ),
  ),
  includeDomains: v.optional(
    v.pipe(
      v.array(v.string()),
      v.description("Restrict results to these domains"),
    ),
  ),
  excludeDomains: v.optional(
    v.pipe(
      v.array(v.string()),
      v.description("Exclude results from these domains"),
    ),
  ),
  requiredText: v.optional(
    v.pipe(
      v.array(v.string()),
      v.description("Only return results containing this text"),
    ),
  ),
  maxAge: v.optional(
    v.pipe(
      v.picklist([1, 7, 30]),
      v.description("Max age in days: 1 (day), 7 (week), 30 (month)"),
    ),
  ),
});

export type SearchInput = v.InferOutput<typeof SearchSchema>;

/**
 * Handler for the cinder_search tool.
 * Searches the web via SearXNG (primary) or Brave Search (fallback) proxied through Cinder.
 */
export function createSearchHandler(client: CinderClient) {
  return async (input: Record<string, unknown>) => {
    const params = input as unknown as SearchParams;
    try {
      const result = await client.search(params);

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
        const meta: string[] = [];
        if (item.domain) meta.push(item.domain);
        if (item.id) meta.push(`id: ${item.id}`);
        if (typeof item.relevance === "number") {
          meta.push(`relevance: ${item.relevance}`);
        }
        if (meta.length > 0) {
          lines.push(`_${meta.join(" · ")}_`);
        }
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
