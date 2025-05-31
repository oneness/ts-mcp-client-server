import { MCPClient } from "./client";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import Anthropic from '@anthropic-ai/sdk';

interface MCPToolResult {
  tool: string;
  result: string;
}

class LLM {
  private mcpClient: MCPClient;
  private availableTools: Tool[] = [];
  private anthropic: Anthropic;
  private conversationHistory: Anthropic.Messages.MessageParam[] = [];
  private systemPrompt: string = "";
  private verboseLogging: boolean = true;

  constructor(apiKey: string) {
    this.mcpClient = new MCPClient();
    this.anthropic = new Anthropic({
      apiKey: apiKey,
    });
  }

  async initialize() {
    await this.mcpClient.connect();
    this.availableTools = await this.mcpClient.listTools();
    this.systemPrompt = this.buildSystemPrompt();
  }

  private buildSystemPrompt(): string {
    const toolDescriptions = this.availableTools.map(tool => {
      const params = tool.inputSchema?.properties ? 
        Object.entries(tool.inputSchema.properties).map(([key, value]: [string, any]) => 
          `${key}: ${value.description || value.type || 'any'}`
        ).join(', ') : 'none';
      
      return `<tool name="${tool.name}">
<description>${tool.description}</description>
<parameters>${params}</parameters>
</tool>`;
    }).join('\n');

    return `You are an AI assistant with access to MCP (Model Context Protocol) tools. When you need to use a tool, you should call it using the tool_use format.

Available tools:
${toolDescriptions}

IMPORTANT LOGGING INSTRUCTIONS:
- Use the get_logging_mode tool to check the current logging setting
- If logging mode is "verbose": Show detailed steps, tool executions, and reasoning process
- If logging mode is "quiet": Provide only the final answer without showing intermediate steps
- Users can change the logging mode with set_logging_mode tool

Use tools when appropriate to answer user questions. You can call multiple tools in sequence if needed.`;
  }

  private convertMCPToolsToAnthropicFormat(): Anthropic.Tool[] {
    return this.availableTools.map(tool => {
      // Ensure we have a valid input schema with required 'type' field
      const inputSchema = tool.inputSchema || {};
      
      return {
        name: tool.name,
        description: tool.description || `MCP tool: ${tool.name}`,
        input_schema: {
          type: "object" as const,
          properties: inputSchema.properties || {},
          required: inputSchema.required || [],
          ...inputSchema
        }
      } as Anthropic.Tool;
    });
  }

  async processMessage(userMessage: string): Promise<string> {
    // Check current logging mode from server
    await this.syncLoggingMode();
    
    this.log(`\n🤖 Processing: "${userMessage}"`);
    
    // Add user message to conversation
    this.conversationHistory.push({
      role: "user",
      content: userMessage
    });

    this.log(`📋 Conversation history length before processing: ${this.conversationHistory.length}`);

    try {
      // Prepare tools for Claude
      const tools = this.convertMCPToolsToAnthropicFormat();
      
      // Get Claude's response
      const cleanHistory = this.cleanConversationHistory();
      this.log(`📋 Sending ${cleanHistory.length} messages to Claude (cleaned from ${this.conversationHistory.length})`);
      
      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1000,
        system: this.systemPrompt,
        messages: cleanHistory,
        tools: tools.length > 0 ? tools : undefined,
      });

      this.log(`🧠 Claude response:`, JSON.stringify(response, null, 2));

      // Process the response
      let finalResponse = "";
      const toolResults: MCPToolResult[] = [];

      // Collect tool uses and text content
      const toolUses: any[] = [];
      for (const content of response.content) {
        if (content.type === 'text') {
          finalResponse += content.text;
        } else if (content.type === 'tool_use') {
          toolUses.push(content);
        }
      }

      // Process all tool uses
      if (toolUses.length > 0) {
        // Add the assistant message with tool_use content to history
        this.conversationHistory.push({
          role: "assistant",
          content: response.content
        });

        // Execute all tools and collect results
        const toolResultsForMessage: any[] = [];
        for (const toolUse of toolUses) {
          this.log(`🔧 Claude wants to use tool: ${toolUse.name} with args:`, toolUse.input);
          
          // Call the MCP tool
          const mcpResult = await this.mcpClient.callTool(toolUse.name, toolUse.input);
          
          let toolResultText = "No result";
          if (mcpResult && mcpResult.content) {
            toolResultText = mcpResult.content
              .filter(c => c.type === 'text')
              .map(c => c.text)
              .join('\n');
          }

          toolResults.push({
            tool: toolUse.name,
            result: toolResultText
          });

          // Add tool result for this specific tool use
          toolResultsForMessage.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: toolResultText
          });
        }

        // Add all tool results in a single user message
        this.conversationHistory.push({
          role: "user",
          content: toolResultsForMessage
        });
      }

      // If we used tools, get Claude's final response incorporating the results
      if (toolUses.length > 0) {
        this.log(`📊 Tool results:`, toolResults);
        const cleanHistoryForFinal = this.cleanConversationHistory();
        this.log(`📋 Conversation history before final completion: ${cleanHistoryForFinal.length} messages`);
        
        const finalCompletion = await this.anthropic.messages.create({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 1000,
          system: this.systemPrompt,
          messages: cleanHistoryForFinal,
          tools: tools.length > 0 ? tools : undefined,
        });

        this.log(`finalCompletion after tool use: `, JSON.stringify(finalCompletion, null, 2));

        // Check if final completion contains more tool uses (multi-turn scenario)
        const finalToolUses = finalCompletion.content.filter(c => c.type === 'tool_use');
        if (finalToolUses.length > 0) {
          this.log(`⚠️  Final completion contains ${finalToolUses.length} more tool uses - this may require processComplexQuery method`);
          finalResponse = "Complex multi-tool request detected. Please use the processComplexQuery method for better handling.";
        } else {
          // Extract text from final response - keep any initial response text if final is empty
          let newFinalResponse = "";
          for (const content of finalCompletion.content) {
            if (content.type === 'text') {
              newFinalResponse += content.text;
            }
          }

          // If the final completion has text, use it; otherwise keep the original response
          if (newFinalResponse.trim()) {
            finalResponse = newFinalResponse;
          } else if (!finalResponse.trim()) {
            // If both are empty, provide a default response showing tool results
            finalResponse = `Tool executed successfully. Results: ${toolResults.map(tr => `${tr.tool}: ${tr.result}`).join('; ')}`;
          }
        }

        this.log(`finalResponse after tool use: `, finalResponse);

        this.conversationHistory.push({
          role: "assistant",
          content: finalCompletion.content
        });
      } else {
        // No tools were used, add the response to history
        this.conversationHistory.push({
          role: "assistant",
          content: response.content
        });
      }

      return finalResponse;

    } catch (error) {
      console.error('Error calling Claude:', error);
      return "I'm sorry, I encountered an error processing your request.";
    }
  }

  // Alternative method using streaming for real-time responses
  async processMessageStream(userMessage: string): Promise<string> {
    console.log(`\n🤖 Processing with streaming: "${userMessage}"`);
    
    this.conversationHistory.push({
      role: "user",
      content: userMessage
    });

    try {
      const tools = this.convertMCPToolsToAnthropicFormat();
      
      const stream = this.anthropic.messages.stream({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1000,
        system: this.systemPrompt,
        messages: this.conversationHistory,
        tools: tools.length > 0 ? tools : undefined,
      });

      let fullResponse = "";
      const toolCalls: any[] = [];

      // Process the stream
      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'text') {
            process.stdout.write('🤖 ');
          } else if (event.content_block.type === 'tool_use') {
            console.log(`\n🔧 Tool call: ${event.content_block.name}`);
            toolCalls.push(event.content_block);
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            process.stdout.write(event.delta.text);
            fullResponse += event.delta.text;
          }
        } else if (event.type === 'message_stop') {
          console.log('\n');
          break;
        }
      }

      // Handle tool calls if any
      if (toolCalls.length > 0) {
        const toolResults = [];
        
        for (const toolCall of toolCalls) {
          console.log(`📞 Executing tool: ${toolCall.name}`);
          const mcpResult = await this.mcpClient.callTool(toolCall.name, toolCall.input);
          
          let toolResultText = "No result";
          if (mcpResult && mcpResult.content) {
            toolResultText = mcpResult.content
              .filter(c => c.type === 'text')
              .map(c => c.text)
              .join('\n');
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolCall.id,
            content: toolResultText
          });
        }

        // Send tool results back to Claude - combine tool_use blocks with any text
        const assistantContent = [...toolCalls];
        if (fullResponse.trim()) {
          assistantContent.push({ type: "text", text: fullResponse });
        }
        
        this.conversationHistory.push({
          role: "assistant",
          content: assistantContent
        });

        this.conversationHistory.push({
          role: "user",
          content: toolResults
        });

        // Get final response
        const finalResponse = await this.anthropic.messages.create({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 1000,
          system: this.systemPrompt,
          messages: this.conversationHistory,
          tools: tools.length > 0 ? tools : undefined,
        });

        let finalText = "";
        for (const content of finalResponse.content) {
          if (content.type === 'text') {
            finalText += content.text;
          }
        }

        this.conversationHistory.push({
          role: "assistant",
          content: finalResponse.content
        });

        return finalText;
      } else {
        this.conversationHistory.push({
          role: "assistant",
          content: [{ type: "text", text: fullResponse }]
        });
        return fullResponse;
      }

    } catch (error) {
      console.error('Error with streaming:', error);
      return "I'm sorry, I encountered an error processing your request.";
    }
  }

  // Method to handle multi-turn tool conversations
  async processComplexQuery(userMessage: string, maxToolRounds: number = 3): Promise<string> {
    // Check current logging mode from server
    await this.syncLoggingMode();
    
    this.log(`\n🤖 Processing complex query: "${userMessage}"`);
    
    this.conversationHistory.push({
      role: "user",
      content: userMessage
    });

    let currentRound = 0;
    let finalResponse = "";

    try {
      while (currentRound < maxToolRounds) {
        this.log(`🔄 Starting round ${currentRound + 1}/${maxToolRounds}`);
        const tools = this.convertMCPToolsToAnthropicFormat();
        
        // Clean conversation history before sending
        const cleanHistory = this.cleanConversationHistory();
        this.log(`📋 Sending ${cleanHistory.length} messages to Claude (cleaned from ${this.conversationHistory.length})`);
        
        const response = await this.anthropic.messages.create({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 1000,
          system: this.systemPrompt,
          messages: cleanHistory,
          tools: tools.length > 0 ? tools : undefined,
        });

        let hasToolCalls = false;
        const toolResults = [];

        // Process response content
        for (const content of response.content) {
          if (content.type === 'text') {
            finalResponse = content.text;
            this.log(`📝 Round ${currentRound + 1} - Text response: ${content.text}`);
          } else if (content.type === 'tool_use') {
            hasToolCalls = true;
            this.log(`🔧 Round ${currentRound + 1} - Tool: ${content.name} with args:`, content.input);
            
            try {
              const mcpResult = await this.mcpClient.callTool(content.name, content.input);
              let toolResultText = "No result";
              
              if (mcpResult && mcpResult.content) {
                const resultTexts = mcpResult.content
                  .filter(c => c.type === 'text')
                  .map(c => c.text)
                  .filter(text => text && text.trim().length > 0);
                
                if (resultTexts.length > 0) {
                  toolResultText = resultTexts.join('\n');
                }
              }

              // Ensure we have non-empty result text
              if (!toolResultText || toolResultText.trim().length === 0) {
                toolResultText = "Tool executed successfully but returned no content";
              }

              this.log(`✅ Round ${currentRound + 1} - Tool ${content.name} result: ${toolResultText.substring(0, 200)}...`);

              toolResults.push({
                type: "tool_result",
                tool_use_id: content.id,
                content: toolResultText
              });
            } catch (error) {
              this.log(`❌ Round ${currentRound + 1} - Tool ${content.name} failed:`, error);
              toolResults.push({
                type: "tool_result",
                tool_use_id: content.id,
                content: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`
              });
            }
          }
        }

        // Add assistant response to history
        this.conversationHistory.push({
          role: "assistant",
          content: response.content
        });

        if (hasToolCalls) {
          // Add tool results and continue
          this.log(`🔄 Round ${currentRound + 1} - Adding ${toolResults.length} tool results and continuing...`);
          this.conversationHistory.push({
            role: "user",
            content: toolResults
          });
          currentRound++;
        } else {
          // No more tools needed, we're done
          this.log(`🏁 Round ${currentRound + 1} - No more tools needed, finishing with response: ${finalResponse}`);
          break;
        }
      }

      return finalResponse;

    } catch (error) {
      console.error('Error in complex query:', error);
      return "I'm sorry, I encountered an error processing your complex request.";
    }
  }

  // Method to set logging mode
  setVerboseLogging(verbose: boolean) {
    this.verboseLogging = verbose;
  }

  // Method to get logging mode
  getVerboseLogging(): boolean {
    return this.verboseLogging;
  }

  // Conditional logging method
  private log(...args: any[]) {
    if (this.verboseLogging) {
      console.log(...args);
    }
  }

  // Sync logging mode with server (public version for external access)
  async syncLoggingModePublic() {
    return this.syncLoggingMode();
  }

  // Sync logging mode with server
  private async syncLoggingMode() {
    try {
      const result = await this.mcpClient.callTool("get_logging_mode", {});
      if (result && result.content && result.content.length > 0) {
        const response = result.content[0].text as string;
        if (response && typeof response === 'string') {
          if (response.includes("verbose")) {
            this.verboseLogging = true;
          } else if (response.includes("quiet")) {
            this.verboseLogging = false;
          }
          // Also sync the client logging
          this.mcpClient.setVerboseLogging(this.verboseLogging);
        }
      }
    } catch (error) {
      // If we can't get logging mode, default to verbose
      this.verboseLogging = true;
      this.mcpClient.setVerboseLogging(true);
    }
  }

  // Method to clear conversation history
  clearHistory() {
    this.conversationHistory = [];
  }

  // Method to get conversation history
  getHistory(): Anthropic.Messages.MessageParam[] {
    return [...this.conversationHistory];
  }

  // Validate message content is not empty
  private validateMessage(message: Anthropic.Messages.MessageParam): boolean {
    if (typeof message.content === 'string') {
      return message.content.trim().length > 0;
    } else if (Array.isArray(message.content)) {
      return message.content.length > 0 && message.content.some(content => {
        if (content.type === 'text') {
          return content.text && content.text.trim().length > 0;
        } else if (content.type === 'tool_result') {
          return content.content && typeof content.content === 'string' && content.content.trim().length > 0;
        } else if (content.type === 'tool_use') {
          return content.name && content.name.trim().length > 0;
        }
        return true; // For other content types, assume valid
      });
    }
    return false;
  }

  // Clean conversation history to remove empty messages
  private cleanConversationHistory(): Anthropic.Messages.MessageParam[] {
    const cleaned = this.conversationHistory.filter(message => this.validateMessage(message));
    
    // Ensure we don't have consecutive assistant messages or other invalid patterns
    const result: Anthropic.Messages.MessageParam[] = [];
    let lastRole: string | null = null;
    
    for (const message of cleaned) {
      // Skip consecutive messages from the same role (except for tool sequences)
      if (lastRole === message.role && message.role === 'assistant' && 
          (!Array.isArray(message.content) || 
          (Array.isArray(message.content) && !message.content.some(c => c.type === 'tool_use')))) {
        continue;
      }
      
      result.push(message);
      lastRole = message.role;
    }
    
    return result;
  }

  async shutdown() {
    await this.mcpClient.close();
  }
}

export { LLM };

