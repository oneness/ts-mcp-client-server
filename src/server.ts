import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  ListToolsResult,
  CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";

// =============================================================================
// MCP SERVER IMPLEMENTATION
// =============================================================================


class MCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "hello-world-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    // Handle list_tools requests
    this.server.setRequestHandler(ListToolsRequestSchema, async (): Promise<ListToolsResult> => {
      return {
        tools: [
          {
            name: "say_hello",
            description: "Says hello to a person",
            inputSchema: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "The name of the person to greet",
                },
              },
              required: ["name"],
            },
          } as Tool,
          {
            name: "get_time",
            description: "Gets the current time",
            inputSchema: {
              type: "object",
              properties: {},
            },
          } as Tool,
        ],
      };
    });

    // Handle call_tool requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case "say_hello":
          const personName = args?.name || "World";
          return {
            content: [
              {
                type: "text",
                text: `Hello, ${personName}! This is a greeting from the MCP server.`,
              },
            ],
          };

        case "get_time":
          return {
            content: [
              {
                type: "text",
                text: `Current time: ${new Date().toISOString()}`,
              },
            ],
          };

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Hello World MCP Server running on stdio");
  }
}

export { MCPServer };
