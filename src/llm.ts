import { HelloWorldClient } from "./client";
import {
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

class LLM {
  private mcpClient: HelloWorldClient;
  private availableTools: Tool[] = [];

  constructor() {
    this.mcpClient = new HelloWorldClient();
  }

  async initialize() {
    await this.mcpClient.connect();
    this.availableTools = await this.mcpClient.listTools();
  }

  async processMessage(userMessage: string): Promise<string> {
    console.log(`\n🤖 LLM thinking about: "${userMessage}"`);
    
    // Simple intent detection (in real LLM, this would be much more sophisticated)
    const intent = this.detectIntent(userMessage);
    
    if (intent.needsTools) {
      console.log(`🔧 LLM decided to use tools: ${intent.tools.join(', ')}`);
      
      const toolResults = [];
      
      for (const toolCall of intent.tools) {
        console.log(`📞 LLM calling MCP tool: ${toolCall.name}`);
        const result = await this.mcpClient.callTool(toolCall.name, toolCall.args);
        
        if (result && result.content) {
          const textContent = result.content
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join('\n');
          toolResults.push(textContent);
        }
      }
      
      // Generate response incorporating tool results
      return this.generateResponseWithTools(userMessage, intent, toolResults);
    } else {
      // Generate simple response without tools
      return this.generateSimpleResponse(userMessage);
    }
  }

  private detectIntent(message: string): { needsTools: boolean; tools: Array<{name: string; args: any}> } {
    const lowerMessage = message.toLowerCase();
    const tools = [];

    // Greeting detection
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi ') || lowerMessage.includes('greet')) {
      const nameMatch = message.match(/(?:hello|hi|greet)\s+(\w+)/i);
      const name = nameMatch ? nameMatch[1] : 'there';
      tools.push({ name: 'say_hello', args: { name } });
    }

    // Time detection
    if (lowerMessage.includes('time') || lowerMessage.includes('clock') || lowerMessage.includes('what time')) {
      tools.push({ name: 'get_time', args: {} });
    }

    return {
      needsTools: tools.length > 0,
      tools
    };
  }

  private generateResponseWithTools(userMessage: string, intent: any, toolResults: string[]): string {
    const responses = [
      `I used my MCP tools to help with your request. Here's what I found:\n\n${toolResults.join('\n\n')}\n\nIs there anything else you'd like to know?`,
      `Based on your message "${userMessage}", I called some tools and got these results:\n\n${toolResults.join('\n\n')}`,
      `Great! I was able to get this information for you:\n\n${toolResults.join('\n\n')}\n\nHow else can I help?`
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }

  private generateSimpleResponse(message: string): string {
    const responses = [
      "I understand your message, but I don't need to use any tools for this. How can I help you with something that requires external data?",
      "That's interesting! Try asking me about time, or ask me to say hello to someone.",
      "I'm a demo LLM with MCP capabilities. I can tell time and greet people. What would you like to try?",
      `You said: "${message}". I can help with time, and greetings using my MCP tools!`
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }

  async shutdown() {
    await this.mcpClient.close();
  }
}

export { LLM };
