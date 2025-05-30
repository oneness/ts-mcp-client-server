import dotenv from 'dotenv';
import { LLM } from "./llm";
import * as readline from 'readline';

dotenv.config({ path: '.env.local' });

class ChatCLI {
  private rl: readline.Interface;
  private llm: LLM;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    this.llm = new LLM(process.env.ANTHROPIC_API_KEY!);
  }

  async start() {
    console.log("🚀 Starting MCP Demo Chat CLI...\n");
    
    try {
      await this.llm.initialize();
      
      console.log("✅ MCP connection established!");
      console.log("\n" + "=".repeat(60));
      console.log("🎉 WELCOME TO MCP DEMO CHAT");
      console.log("=".repeat(60));
      console.log("Try these commands:");
      console.log("• 'Hello Alice' - Greeting tool");
      console.log("• 'What time is it?' - Time tool");  
      console.log("• 'quit' or 'exit' - Exit chat");
      console.log("=".repeat(60) + "\n");
      
      this.chatLoop();
      
    } catch (error) {
      console.error("❌ Failed to initialize:", error);
      process.exit(1);
    }
  }

  private chatLoop() {
    this.rl.question("You: ", async (input) => {
      const trimmedInput = input.trim();
      
      if (trimmedInput.toLowerCase() === 'quit' || trimmedInput.toLowerCase() === 'exit') {
        console.log("\n👋 Goodbye!");
        await this.shutdown();
        return;
      }
      
      if (trimmedInput === '') {
        this.chatLoop();
        return;
      }
      
      try {
        // Use complex query method for better multi-tool handling
        const response = await this.llm.processComplexQuery(trimmedInput, 5);
        console.log(`\nLLM: ${response}\n`);
      } catch (error) {
        console.error("❌ Error processing message:", error);
        console.error("Error details:", error.message);
      }
      
      this.chatLoop();
    });
  }

  private async shutdown() {
    await this.llm.shutdown();
    this.rl.close();
    process.exit(0);
  }
}

export { ChatCLI };
