import { HelloWorldServer } from "./server"
import { HelloWorldClient } from "./client"

async function run() {
  console.log("=== MCP Hello World Demo ===\n");

    // Demo client usage
  console.log("\nSetting up MCP Client...");
  const client = new HelloWorldClient();
  
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
    const server = new HelloWorldServer();
    server.start().catch(console.error);
  } else if (process.argv[2] === "client") {
    run().catch(console.error);
  } else {
    console.log("Usage:");
    console.log("  node dist/index.js server  # Run as MCP server");
    console.log("  node dist/index.js client  # Run demo client");
  }
}
