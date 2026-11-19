// Starts the Illini Scheduler MCP server on stdio, for Claude Desktop, Claude Code and other MCP clients (mcp/README.md).
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { dataSource } from "./data";
import { createServer } from "./server";

const src = dataSource();
await createServer(src).connect(new StdioServerTransport());
console.error(`illini-scheduler MCP server running on stdio (data: ${src.root})`);
