#!/usr/bin/env bun

import { serve } from "srvx";
import { StdioTransport } from "@tmcp/transport-stdio";
import { HttpTransport } from "@tmcp/transport-http";
import { SseTransport } from "@tmcp/transport-sse";
import { createServer } from "./server.js";
import { getConfig } from "./config.js";
import { oauth } from "./auth-provider.js";

// ---------------------------------------------------------------------------
// Initialize
// ---------------------------------------------------------------------------

const config = getConfig();
const server = createServer();

// ---------------------------------------------------------------------------
// HTTP + SSE Transport (for remote / production)
// ---------------------------------------------------------------------------

const http_transport = new HttpTransport(server, {
  oauth: config.OAUTH_ENABLED ? oauth : undefined,
});

const sse_transport = new SseTransport(server, {
  oauth: config.OAUTH_ENABLED ? oauth : undefined,
});

serve({
  async fetch(request) {
    // Try HTTP transport (Streamable HTTP for MCP)
    const http_response = await http_transport.respond(request);
    if (http_response) {
      return http_response;
    }

    // Try SSE transport (legacy fallback)
    const sse_response = await sse_transport.respond(request);
    if (sse_response) {
      return sse_response;
    }

    // Root health check
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          service: "cinder-mcp",
          status: "ok",
          version: config.MCP_SERVER_VERSION,
          endpoints: {
            mcp: "/mcp",
            sse: "/sse",
            health: "/health",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(null, { status: 404 });
  },
  port: Number(config.PORT),
});

console.log(`🚀 Cinder MCP server running on port ${config.PORT}`);
console.log(`   Health: http://localhost:${config.PORT}/health`);
console.log(`   MCP:    http://localhost:${config.PORT}/mcp`);
console.log(`   SSE:    http://localhost:${config.PORT}/sse`);

// ---------------------------------------------------------------------------
// STDIO Transport (for local / CLI usage)
// ---------------------------------------------------------------------------

const stdio_transport = new StdioTransport(server);
stdio_transport.listen();
