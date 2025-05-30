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
import { exec } from "child_process";
import { promisify } from "util";
import { chromium } from "playwright-core";
import Browserbase from "@browserbasehq/sdk";
import { LinkupClient } from "linkup-sdk";

const execAsync = promisify(exec);

// =============================================================================
// MCP SERVER IMPLEMENTATION
// =============================================================================


class MCPServer {
  private server: Server;
  private browser: any = null;
  private page: any = null;
  private browserbase: Browserbase;
  private linkupClient: LinkupClient;
  private verboseLogging: boolean = true;

  constructor() {
    this.browserbase = new Browserbase({ 
      apiKey: process.env.BROWSERBASE_API_KEY || "" 
    });
    this.linkupClient = new LinkupClient({ 
      apiKey: process.env.LINKUP_API_KEY || "" 
    });
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
          {
            name: "execute_bash",
            description: "Executes a bash command and returns the output",
            inputSchema: {
              type: "object",
              properties: {
                command: {
                  type: "string",
                  description: "The bash command to execute",
                },
              },
              required: ["command"],
            },
          } as Tool,
          {
            name: "browser_navigate",
            description: "Navigate to a URL using Browserbase browser automation",
            inputSchema: {
              type: "object",
              properties: {
                url: {
                  type: "string",
                  description: "The URL to navigate to",
                },
              },
              required: ["url"],
            },
          } as Tool,
          {
            name: "browser_click",
            description: "Click on an element in the browser using CSS selector",
            inputSchema: {
              type: "object",
              properties: {
                selector: {
                  type: "string",
                  description: "CSS selector for the element to click",
                },
              },
              required: ["selector"],
            },
          } as Tool,
          {
            name: "browser_type",
            description: "Type text into an input field using CSS selector",
            inputSchema: {
              type: "object",
              properties: {
                selector: {
                  type: "string",
                  description: "CSS selector for the input field",
                },
                text: {
                  type: "string",
                  description: "Text to type",
                },
              },
              required: ["selector", "text"],
            },
          } as Tool,
          {
            name: "browser_screenshot",
            description: "Take a screenshot of the current browser page",
            inputSchema: {
              type: "object",
              properties: {},
            },
          } as Tool,
          {
            name: "browser_get_text",
            description: "Get text content from an element using CSS selector",
            inputSchema: {
              type: "object",
              properties: {
                selector: {
                  type: "string",
                  description: "CSS selector for the element",
                },
              },
              required: ["selector"],
            },
          } as Tool,
          {
            name: "linkup_search",
            description: "Search the web using Linkup for factual and up-to-date information",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The search query - be specific for best results",
                },
                depth: {
                  type: "string",
                  enum: ["standard", "deep"],
                  description: "Search depth: 'standard' (faster, 1 credit) or 'deep' (comprehensive, 10 credits)",
                  default: "standard"
                },
                outputType: {
                  type: "string",
                  enum: ["searchResults", "sourcedAnswer"],
                  description: "Output format: 'searchResults' for raw results or 'sourcedAnswer' for processed answer",
                  default: "searchResults"
                },
                includeImages: {
                  type: "boolean",
                  description: "Whether to include images in results",
                  default: false
                }
              },
              required: ["query"],
            },
          } as Tool,
          {
            name: "set_logging_mode",
            description: "Control the verbosity of responses - choose between verbose logging or concise answers",
            inputSchema: {
              type: "object",
              properties: {
                mode: {
                  type: "string",
                  enum: ["verbose", "quiet"],
                  description: "Logging mode: 'verbose' shows detailed process steps, 'quiet' returns only final answers",
                },
              },
              required: ["mode"],
            },
          } as Tool,
          {
            name: "get_logging_mode",
            description: "Get the current logging mode setting",
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

        case "execute_bash":
          const command = args?.command as string;
          if (!command) {
            throw new Error("Command is required");
          }
          
          try {
            const { stdout, stderr } = await execAsync(command);
            return {
              content: [
                {
                  type: "text",
                  text: `Command: ${command}\nOutput:\n${stdout}${stderr ? `\nError:\n${stderr}` : ''}`,
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Command: ${command}\nError: ${error.message}`,
                },
              ],
            };
          }

        case "browser_navigate":
          const navUrl = args?.url as string;
          if (!navUrl) {
            return {
              content: [
                {
                  type: "text",
                  text: "Error: URL is required for browser navigation",
                },
              ],
            };
          }

          try {
            await this.ensureBrowserSession();
            await this.page.goto(navUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            const title = await this.page.title();
            return {
              content: [
                {
                  type: "text",
                  text: `Successfully navigated to: ${navUrl}\nPage title: ${title}`,
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error navigating to ${navUrl}: ${error instanceof Error ? error.message : String(error)}`,
                },
              ],
            };
          }

        case "browser_click":
          const clickSelector = args?.selector as string;
          if (!clickSelector) {
            return {
              content: [
                {
                  type: "text",
                  text: "Error: CSS selector is required for clicking elements",
                },
              ],
            };
          }

          try {
            await this.ensureBrowserSession();
            await this.page.waitForSelector(clickSelector, { timeout: 10000 });
            await this.page.click(clickSelector);
            return {
              content: [
                {
                  type: "text",
                  text: `Successfully clicked element: ${clickSelector}`,
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error clicking element ${clickSelector}: ${error instanceof Error ? error.message : String(error)}`,
                },
              ],
            };
          }

        case "browser_type":
          const typeSelector = args?.selector as string;
          const typeText = args?.text as string;
          if (!typeSelector || typeText === undefined) {
            return {
              content: [
                {
                  type: "text",
                  text: "Error: Both CSS selector and text are required for typing",
                },
              ],
            };
          }

          try {
            await this.ensureBrowserSession();
            await this.page.waitForSelector(typeSelector, { timeout: 10000 });
            await this.page.fill(typeSelector, typeText);
            return {
              content: [
                {
                  type: "text",
                  text: `Successfully typed "${typeText}" into element: ${typeSelector}`,
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error typing into element ${typeSelector}: ${error instanceof Error ? error.message : String(error)}`,
                },
              ],
            };
          }

        case "browser_screenshot":
          try {
            await this.ensureBrowserSession();
            const screenshot = await this.page.screenshot({ encoding: 'base64', fullPage: true });
            return {
              content: [
                {
                  type: "text",
                  text: `Screenshot taken successfully. Data size: ${screenshot.length} characters`,
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error taking screenshot: ${error instanceof Error ? error.message : String(error)}`,
                },
              ],
            };
          }

        case "browser_get_text":
          const textSelector = args?.selector as string;
          if (!textSelector) {
            return {
              content: [
                {
                  type: "text",
                  text: "Error: CSS selector is required for getting text",
                },
              ],
            };
          }

          try {
            await this.ensureBrowserSession();
            await this.page.waitForSelector(textSelector, { timeout: 10000 });
            const text = await this.page.textContent(textSelector);
            return {
              content: [
                {
                  type: "text",
                  text: `Text from ${textSelector}: ${text || "Element found but contains no text"}`,
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error getting text from element ${textSelector}: ${error instanceof Error ? error.message : String(error)}`,
                },
              ],
            };
          }

        case "linkup_search":
          const searchQuery = args?.query as string;
          if (!searchQuery) {
            return {
              content: [
                {
                  type: "text",
                  text: "Error: Search query is required",
                },
              ],
            };
          }

          try {
            if (!process.env.LINKUP_API_KEY) {
              return {
                content: [
                  {
                    type: "text",
                    text: "Error: LINKUP_API_KEY environment variable is required",
                  },
                ],
              };
            }

            const searchParams = {
              query: searchQuery,
              depth: (args?.depth as "standard" | "deep") || "standard",
              outputType: (args?.outputType as "searchResults" | "sourcedAnswer") || "searchResults",
              includeImages: (args?.includeImages as boolean) || false,
            };

            this.log("🔍 Linkup search params:", searchParams);
            const response = await this.linkupClient.search(searchParams);
            
            let resultText = "";
            if (searchParams.outputType === "sourcedAnswer") {
              resultText = `Linkup Search Results for: "${searchQuery}"\n\nAnswer: ${JSON.stringify(response, null, 2)}`;
            } else {
              resultText = `Linkup Search Results for: "${searchQuery}"\n\nResults: ${JSON.stringify(response, null, 2)}`;
            }

            return {
              content: [
                {
                  type: "text",
                  text: resultText,
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error performing Linkup search: ${error instanceof Error ? error.message : String(error)}`,
                },
              ],
            };
          }

        case "set_logging_mode":
          const mode = args?.mode as string;
          if (!mode || !["verbose", "quiet"].includes(mode)) {
            return {
              content: [
                {
                  type: "text",
                  text: "Error: Mode must be either 'verbose' or 'quiet'",
                },
              ],
            };
          }

          this.verboseLogging = mode === "verbose";
          return {
            content: [
              {
                type: "text",
                text: `Logging mode set to: ${mode}. ${mode === "verbose" ? "Will show detailed process steps." : "Will return only final answers."}`,
              },
            ],
          };

        case "get_logging_mode":
          return {
            content: [
              {
                type: "text",
                text: `Current logging mode: ${this.verboseLogging ? "verbose" : "quiet"}. ${this.verboseLogging ? "Showing detailed process steps." : "Returning only final answers."}`,
              },
            ],
          };

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  private async ensureBrowserSession() {
    if (!this.browser || !this.page) {
      if (!process.env.BROWSERBASE_API_KEY) {
        throw new Error("BROWSERBASE_API_KEY environment variable is required");
      }
      if (!process.env.BROWSERBASE_PROJECT_ID) {
        throw new Error("BROWSERBASE_PROJECT_ID environment variable is required");
      }

      this.log("🌐 Creating new Browserbase session...");
      const session = await this.browserbase.sessions.create({
        projectId: process.env.BROWSERBASE_PROJECT_ID,
      });

      this.log("🔗 Connecting to browser session...");
      this.browser = await chromium.connectOverCDP(session.connectUrl);
      const contexts = this.browser.contexts();
      const context = contexts.length > 0 ? contexts[0] : await this.browser.newContext();
      this.page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
      this.log("✅ Browser session ready");
    }
  }

  // Method to get logging state for external access
  getVerboseLogging(): boolean {
    return this.verboseLogging;
  }

  // Conditional logging method
  private log(...args: any[]) {
    if (this.verboseLogging) {
      console.log(...args);
    }
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Hello World MCP Server running on stdio");
  }
}

export { MCPServer };
