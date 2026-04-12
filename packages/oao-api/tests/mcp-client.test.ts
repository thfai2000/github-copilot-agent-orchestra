import { describe, it, expect, vi, beforeAll } from 'vitest';

// ─── Mock dependencies ──────────────────────────────────────────────
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({
      tools: [
        {
          name: 'test_tool',
          description: 'A test tool',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              limit: { type: 'number', description: 'Max results' },
              verbose: { type: 'boolean', description: 'Verbose mode' },
              tags: { type: 'array', description: 'Tags' },
              level: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Level' },
            },
            required: ['query'],
          },
        },
        {
          name: 'simple_tool',
          description: 'Simple tool with no input',
          inputSchema: {},
        },
      ],
    }),
    callTool: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: '{"result": "success"}' }],
    }),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@github/copilot-sdk', () => ({
  defineTool: vi.fn((name: string, config: { handler: Function; description: string }) => ({
    name,
    description: config.description,
    handler: config.handler,
  })),
}));

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-key-must-be-at-least-32-chars-long!!';
  process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
});

describe('connectToMcpServer', () => {
  it('connects and returns tools with cleanup function', async () => {
    const { connectToMcpServer } = await import('../src/services/mcp-client.js');

    const result = await connectToMcpServer({
      name: 'test-server',
      command: 'node',
      args: ['test.js'],
      env: { TEST_KEY: 'value' },
    });

    expect(result.tools).toBeDefined();
    expect(result.tools.length).toBe(2);
    expect(result.cleanup).toBeInstanceOf(Function);
  });

  it('converts MCP tools to Copilot SDK format', async () => {
    const { connectToMcpServer } = await import('../src/services/mcp-client.js');

    const result = await connectToMcpServer({
      name: 'test-server',
      command: 'node',
      args: [],
      env: {},
    });

    const testTool = result.tools.find((t: { name: string }) => t.name === 'test_tool');
    expect(testTool).toBeDefined();
    expect(testTool!.name).toBe('test_tool');
  });

  it('tool handler proxies calls through MCP protocol', async () => {
    const { connectToMcpServer } = await import('../src/services/mcp-client.js');

    const result = await connectToMcpServer({
      name: 'test-server',
      command: 'node',
      args: [],
      env: {},
    });

    const testTool = result.tools.find((t: { name: string }) => t.name === 'test_tool') as { handler: Function };
    const toolResult = await testTool.handler({ query: 'test' });
    expect(toolResult).toEqual({ result: 'success' });
  });

  it('cleanup function calls client.close()', async () => {
    const { connectToMcpServer } = await import('../src/services/mcp-client.js');

    const result = await connectToMcpServer({
      name: 'test-server',
      command: 'node',
      args: [],
      env: {},
    });

    await expect(result.cleanup()).resolves.toBeUndefined();
  });

  it('handles writeTools configuration (skip permission)', async () => {
    const { connectToMcpServer } = await import('../src/services/mcp-client.js');

    const result = await connectToMcpServer({
      name: 'test-server',
      command: 'node',
      args: [],
      env: {},
      writeTools: ['test_tool'],
    });

    expect(result.tools.length).toBe(2);
  });

  it('tool handler handles non-JSON text response', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    // Override callTool to return non-JSON text
    (Client as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      listTools: vi.fn().mockResolvedValue({
        tools: [{ name: 'plain_tool', description: 'Plain text tool', inputSchema: {} }],
      }),
      callTool: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'just plain text' }],
      }),
      close: vi.fn(),
    }));

    const { connectToMcpServer } = await import('../src/services/mcp-client.js');
    const result = await connectToMcpServer({
      name: 'plain-server',
      command: 'node',
      args: [],
      env: {},
    });

    const tool = result.tools[0] as { handler: Function };
    const toolResult = await tool.handler({});
    expect(toolResult).toEqual({ result: 'just plain text' });
  });
});
