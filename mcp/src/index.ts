// Starts the Illini Scheduler MCP server on stdio, for Claude Desktop, Claude Code and other MCP clients (mcp/README.md).
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { version } from "../package.json";
import { dataSource } from "./data";
import { createServer } from "./server";

const src = dataSource();
await createServer(src, version).connect(new StdioServerTransport());
console.error(`illini-scheduler MCP server ${version} running on stdio (data: ${src.root})`);
