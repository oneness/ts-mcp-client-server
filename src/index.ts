import { MCPServer } from "./server"
import { MCPClient } from "./client"
import { ChatCLI } from "./chat"

async function run() {
  console.log("=== MCP Hello World Demo ===\n");

  // Demo client usage
  console.log("\nSetting up MCP Client...");
  const client = new MCPClient();
  
  try {
    await client.connect();
    
    console.log("\nListing available tools...");
    const tools = await client.listTools();

    console.log("\n Tools: ", tools);
    
    console.log("\nCalling 'say_hello' tool...");
    await client.callTool("say_hello", { name: "Alice" });
    
    console.log("\nCalling 'get_time' tool...");
    await client.callTool("get_time");
    
    console.log("\nCalling 'say_hello' without name...");
    await client.callTool("say_hello");
    
  } finally {
    await client.close();
  }
}


// For running as separate server process:
if (require.main === module) {
  if (process.argv[2] === "server") {
    const server = new MCPServer();
    server.start().catch(console.error);
  } else if (process.argv[2] === "client") {
    run().catch(console.error);
  } else if (process.argv[2] === "chat") {
    const chatCLI = new ChatCLI();
    chatCLI.start().catch(console.error);
  } else {
    console.log("Usage:");
    console.log("  npm run mcp  # Run as MCP client/server demo");
    console.log("  npm run chat # Run interactive chat CLI demo");
  }
}

