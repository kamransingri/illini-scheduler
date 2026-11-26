// The MCP server over Streamable HTTP (#102), for the hosted endpoint the HTTP API serves at /mcp (api/, docs/BACKEND.md).
// Stateless: each request gets its own server and transport, so nothing is kept between requests and any running
// instance can answer. Web standards only (Request, Response), like source.ts, so it runs on Supabase's Deno runtime.
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer } from "./server";
import type { DataSource } from "./source";

/** The tools a JSON-RPC body calls, by name only (never their arguments), for counting use. */
export async function toolsCalled(request: Request): Promise<string[]> {
  const body: unknown = await request
    .clone()
    .json()
    .catch(() => null);
  const messages = Array.isArray(body) ? body : [body];
  return messages.flatMap((m) => {
    const msg = m as { method?: unknown; params?: { name?: unknown } } | null;
    return msg?.method === "tools/call" && typeof msg.params?.name === "string" ? [msg.params.name] : [];
  });
}

/** Answers one MCP request (a POST of JSON-RPC messages) with the same tools as the local server. */
export async function handleMcp(request: Request, src: DataSource, version: string): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  const server = createServer(src, version);
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    // the JSON answer is complete once handleRequest returns, so the per-request server can go
    await server.close();
  }
}
