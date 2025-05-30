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
  private verboseLogging: boolean = true;

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
    this.log("Client connecting to MCP server...");
    
    try {
      // Connect to the server process via stdio
      const transport = new StdioClientTransport({
        command: "node",
        args: ["dist/index.js", "server"] // Updated path and args
      });
      
      await this.client.connect(transport);
      this.log("Connected to MCP server");
    } catch (error) {
      console.error("Failed to connect to server:", error);
      throw error;
    }
  }

  async listTools() {
    try {
      const response = await this.client.listTools() as ListToolsResult;
      
      this.log("Available tools:");
      response.tools.forEach((tool) => {
        this.log(`- ${tool.name}: ${tool.description}`);
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

      this.log(`Tool '${name}' response:`);
      response.content.forEach((content) => {
        if (content.type === "text") {
          this.log(content.text);
        }
      });

      return response;
    } catch (error) {
      console.error(`Error calling tool '${name}':`, error);
    }
  }

  // Method to set logging mode
  setVerboseLogging(verbose: boolean) {
    this.verboseLogging = verbose;
  }

  // Conditional logging method
  private log(...args: any[]) {
    if (this.verboseLogging) {
      console.log(...args);
    }
  }

  async close() {
    await this.client.close();
  }
}

export { MCPClient };
