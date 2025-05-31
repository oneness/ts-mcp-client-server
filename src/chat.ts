import dotenv from 'dotenv';
import { LLM } from "./llm";
import * as readline from 'readline';

dotenv.config({ path: '.env.local' });

// Simple spinner class for quiet mode
class Spinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private interval: NodeJS.Timeout | null = null;
  private frameIndex = 0;
  private currentMessage = '';

  start(message: string = 'Thinking') {
    if (this.interval) return; // Already running
    
    this.currentMessage = message;
    this.frameIndex = 0;
    
    // Force output
    process.stdout.write(`\n${message}... ${this.frames[0]}`);
    
    this.interval = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
      process.stdout.write(`\r${this.currentMessage}... ${this.frames[this.frameIndex]}`);
    }, 120);
  }

  updateMessage(message: string) {
    if (this.interval) {
      this.currentMessage = message;
    }
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      process.stdout.write('\r\x1b[K'); // Clear the line
      process.stdout.write('\r'); // Move cursor to beginning
    }
  }
}

class ChatCLI {
  private rl: readline.Interface;
  private llm: LLM;
  private spinner: Spinner;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    this.llm = new LLM(process.env.ANTHROPIC_API_KEY!);
    this.spinner = new Spinner();
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

  private async isQuietMode(): Promise<boolean> {
    try {
      // First ensure the LLM syncs its logging mode
      await this.llm.syncLoggingModePublic();
      // Check current logging mode from LLM
      const isVerbose = this.llm.getVerboseLogging();
      const isQuiet = !isVerbose;
      console.log(`🔍 Debug: isVerbose=${isVerbose}, isQuiet=${isQuiet}`); // Temporary debug
      return isQuiet;
    } catch (error) {
      console.log(`🔍 Debug: Error checking quiet mode, defaulting to verbose`); // Temporary debug
      return false; // Default to verbose if we can't determine
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
        // Check if we're in quiet mode to show spinner
        const isQuietMode = await this.isQuietMode();
        
        if (isQuietMode) {
          this.spinner.start('Thinking');
          // Give spinner a moment to start before processing
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        // Use complex query method for better multi-tool handling
        const response = await this.llm.processComplexQuery(trimmedInput, 5);
        
        if (isQuietMode) {
          this.spinner.stop();
        }
        
        console.log(`\nLLM: ${response}\n`);
      } catch (error) {
        this.spinner.stop(); // Make sure spinner stops on error
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
