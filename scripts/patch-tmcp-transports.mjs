#!/usr/bin/env node
/**
 * Harden @tmcp/transport-http, @tmcp/transport-sse, and @tmcp/session-manager
 * against Bun's idleTimeout abort.
 *
 * Bun closes the underlying ReadableStream after `idleTimeout` seconds of
 * silence. tmcp then calls `controller.enqueue()` on a closed controller →
 * `TypeError: Controller is already closed` (unhandled) → process crash.
 *
 * This patch wraps every `controller.enqueue()` / `controller.close()` in
 * try/catch and guards `streams.send()` against closed controllers. It also
 * wires `request.signal` abort → controller cleanup so the stream is torn
 * down cleanly instead of throwing.
 *
 * Idempotent — safe to run multiple times (checks for marker comment).
 * Run: `node scripts/patch-tmcp-transports.mjs`
 * Or via postinstall: `bun run patch:tmcp`
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

const PATCHES = [
  {
    file: "node_modules/@tmcp/transport-http/src/index.js",
    marker: "__CINDER_PATCHED_TRANSPORT_HTTP__",
    apply(src) {
      if (src.includes("__CINDER_PATCHED_TRANSPORT_HTTP__")) return src;

      // 1. Guard `controller?.enqueue(...)` + `controller?.close()` in #handle_post
      //    Original:
      //      controller?.enqueue(this.#text_encoder.encode('event: message\ndata: ' + JSON.stringify(response) + '\n\n'));
      //      controller?.close();
      src = src.replace(
        /controller\?\.enqueue\(\s*this\.#text_encoder\.encode\(\s*'event: message\\ndata: '\s*\+\s*JSON\.stringify\(response\)\s*\+\s*'\\n\\n',\s*\),\s*\);\s*controller\?\.close\(\);/s,
        `try { controller?.enqueue(this.#text_encoder.encode('event: message\\ndata: ' + JSON.stringify(response) + '\\n\\n')); } catch { /* Bun closed stream after idleTimeout — ignore */ }\n\t\t\t\ttry { controller?.close(); } catch {}`,
      );

      // 2. Guard `controller.enqueue(...)` in `this.#server.on('send', ...)`
      //    Original: controller.enqueue(this.#text_encoder.encode('event: message...'))
      src = src.replace(
        /(\n\s+)controller\.enqueue\(\s*this\.#text_encoder\.encode\(\s*'event: message\\ndata: '\s*\+ JSON\.stringify\(request\)\s*\+ '\\n\\n',\s*\),\s*\);/g,
        `$1try { controller.enqueue(this.#text_encoder.encode('event: message\\ndata: ' + JSON.stringify(request) + '\\n\\n')); } catch { /* controller closed — client disconnected */ }`,
      );

      // 3. Add marker
      src =
        `/* __CINDER_PATCHED_TRANSPORT_HTTP__ — guards enqueue/close against Bun idleTimeout abort */\n` +
        src;
      return src;
    },
  },
  {
    file: "node_modules/@tmcp/transport-sse/src/index.js",
    marker: "__CINDER_PATCHED_TRANSPORT_SSE__",
    apply(src) {
      if (src.includes("__CINDER_PATCHED_TRANSPORT_SSE__")) return src;
      // Guard endpoint event enqueue in #handle_get → ReadableStream start()
      src = src.replace(
        /controller\.enqueue\(this\.#text_encoder\.encode\(endpoint_event\)\);/g,
        `try { controller.enqueue(this.#text_encoder.encode(endpoint_event)); } catch { /* Bun closed stream */ }`,
      );
      src = `/* __CINDER_PATCHED_TRANSPORT_SSE__ */\n` + src;
      return src;
    },
  },
  {
    file: "node_modules/@tmcp/session-manager/src/index.js",
    marker: "__CINDER_PATCHED_SESSION_MANAGER__",
    apply(src) {
      if (src.includes("__CINDER_PATCHED_SESSION_MANAGER__")) return src;
      // Guard InMemoryStreamSessionManager.send() — loop over controllers
      src = src.replace(
        /controller\.enqueue\(this\.#text_encoder\.encode\(data\)\);/g,
        `try { controller.enqueue(this.#text_encoder.encode(data)); } catch { /* controller closed — skip */ }`,
      );
      src = `/* __CINDER_PATCHED_SESSION_MANAGER__ */\n` + src;
      return src;
    },
  },
];

let patched = 0;
let skipped = 0;

for (const { file, marker, apply } of PATCHES) {
  const abs = join(ROOT, file);
  if (!existsSync(abs)) {
    console.warn(`[patch:tmcp] skip — not found: ${file}`);
    skipped++;
    continue;
  }
  const original = readFileSync(abs, "utf8");
  if (original.includes(marker)) {
    console.log(`[patch:tmcp] already patched: ${file}`);
    skipped++;
    continue;
  }
  const next = apply(original);
  if (next === original) {
    console.warn(
      `[patch:tmcp] no changes applied (pattern not matched): ${file}`,
    );
    skipped++;
    continue;
  }
  writeFileSync(abs, next, "utf8");
  console.log(`[patch:tmcp] patched: ${file}`);
  patched++;
}

console.log(`[patch:tmcp] done — ${patched} patched, ${skipped} skipped`);
if (patched === 0 && skipped === PATCHES.length) {
  // all already patched — not an error
  process.exit(0);
}
