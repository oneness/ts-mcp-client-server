import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  CallToolRequestSchema,
  CallToolResult,
  ListToolsRequestSchema,
  ListToolsResult,
} from "@modelcontextprotocol/sdk/types.js";


class MCPClient {
  private client: Client;

  constructor() {
    this.client = new Client(
      {
        name: "hello-world-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );
  }

  async connect() {
    console.log("Client connecting to MCP server...");
    
    try {
      // Connect to the server process via stdio
      const transport = new StdioClientTransport({
        command: "node",
        args: ["dist/index.js", "server"] // Updated path and args
      });
      
      await this.client.connect(transport);
      console.log("Connected to MCP server");
    } catch (error) {
      console.error("Failed to connect to server:", error);
      throw error;
    }
  }

  async listTools() {
    try {
      const response = await this.client.listTools() as ListToolsResult;
      
      console.log("Available tools:");
      response.tools.forEach((tool) => {
        console.log(`- ${tool.name}: ${tool.description}`);
      });
      
      return response.tools;
    } catch (error) {
      console.error("Error listing tools:", error);
      return [];
    }
  }

  async callTool(name: string, args: any = {}) {
    try {
      const response = await this.client.callTool({
        name,
        arguments: args,
      }) as CallToolResult;

      console.log(`Tool '${name}' response:`);
      response.content.forEach((content) => {
        if (content.type === "text") {
          console.log(content.text);
        }
      });

      return response;
    } catch (error) {
      console.error(`Error calling tool '${name}':`, error);
    }
  }

  async close() {
    await this.client.close();
  }
}

export { MCPClient };
