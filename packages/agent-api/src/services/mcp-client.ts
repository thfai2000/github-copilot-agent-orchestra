// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — Copilot SDK's Tool/defineTool generics have incompatible Zod type constraints
/**
 * MCP Client for connecting to the Trading Platform MCP server.
 *
 * Spawns the trading-platform MCP server as a child process (stdio transport)
 * and converts its tools into Copilot SDK Tool[] format for agent sessions.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { defineTool, type Tool } from '@github/copilot-sdk';
import { z } from 'zod';
import { createLogger } from '@ai-trader/shared';

const logger = createLogger('mcp-client');

interface McpClientOptions {
  /** Path to the MCP server entry point (e.g. tsx packages/trading-api/src/mcp-server.ts) */
  command: string;
  args: string[];
  /** Environment variables to pass to the MCP server process */
  env: Record<string, string>;
}

interface McpToolSchema {
  type: string;
  properties?: Record<string, { type: string; description?: string; enum?: string[]; default?: unknown; items?: unknown }>;
  required?: string[];
}

/**
 * Connect to a Trading Platform MCP server via stdio and return Copilot SDK tools.
 *
 * The returned tools proxy all calls through the MCP protocol to the trading platform.
 * Call `cleanup()` when done to terminate the child process.
 */
export async function createMcpTradingTools(
  options: McpClientOptions,
): Promise<{ tools: Tool[]; cleanup: () => Promise<void> }> {
  const transport = new StdioClientTransport({
    command: options.command,
    args: options.args,
    env: { ...process.env, ...options.env } as Record<string, string>,
  });

  const client = new Client({ name: 'agent-orchestra', version: '1.0.0' });
  await client.connect(transport);

  // List all tools from the MCP server
  const { tools: mcpTools } = await client.listTools();
  logger.info({ count: mcpTools.length }, 'Connected to Trading MCP server');

  // Convert each MCP tool into a Copilot SDK tool
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: Tool[] = mcpTools.map((mcpTool: any) => {
    const schema = (mcpTool.inputSchema ?? {}) as McpToolSchema;
    const zodShape: Record<string, z.ZodTypeAny> = {};

    // Build a Zod schema from the JSON Schema properties
    if (schema.properties) {
      for (const [key, prop] of Object.entries(schema.properties)) {
        let field: z.ZodTypeAny;

        if (prop.enum) {
          field = z.enum(prop.enum as [string, ...string[]]);
        } else if (prop.type === 'number' || prop.type === 'integer') {
          field = z.number();
        } else if (prop.type === 'boolean') {
          field = z.boolean();
        } else if (prop.type === 'array') {
          field = z.array(z.string());
        } else {
          field = z.string();
        }

        if (prop.description) field = field.describe(prop.description);

        // If not required, make optional
        if (!schema.required?.includes(key)) {
          field = field.optional();
        }

        zodShape[key] = field;
      }
    }

    // Whether this tool needs permission (write operations)
    const writeTools = ['execute_trade', 'publish_blog_post'];
    const skipPermission = !writeTools.includes(mcpTool.name);

    return defineTool(mcpTool.name, {
      description: mcpTool.description ?? mcpTool.name,
      parameters: z.object(zodShape),
      skipPermission,
      handler: async (params: Record<string, unknown>) => {
        logger.info({ tool: mcpTool.name, params }, `MCP tool call: ${mcpTool.name}`);
        const result = await client.callTool({ name: mcpTool.name, arguments: params });
        // Extract text content from MCP result
        const contents = result.content as Array<{ type: string; text?: string }>;
        const text = contents?.find((c) => c.type === 'text')?.text;
        if (text) {
          try {
            return JSON.parse(text);
          } catch {
            return { result: text };
          }
        }
        return result;
      },
    });
  });

  const cleanup = async () => {
    try {
      await client.close();
    } catch {
      // ignore cleanup errors
    }
  };

  return { tools, cleanup };
}
