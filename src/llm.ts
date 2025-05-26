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
    console.log(`\n🤖 Processing: "${userMessage}"`);
    
    // Add user message to conversation
    this.conversationHistory.push({
      role: "user",
      content: userMessage
    });

    try {
      // Prepare tools for Claude
      const tools = this.convertMCPToolsToAnthropicFormat();
      
      // Get Claude's response
      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1000,
        system: this.systemPrompt,
        messages: this.conversationHistory,
        tools: tools.length > 0 ? tools : undefined,
      });

      console.log(`🧠 Claude response:`, JSON.stringify(response, null, 2));

      // Process the response
      let finalResponse = "";
      const toolResults: MCPToolResult[] = [];

      // Handle different content types
      for (const content of response.content) {
        if (content.type === 'text') {
          finalResponse += content.text;
        } else if (content.type === 'tool_use') {
          console.log(`🔧 Claude wants to use tool: ${content.name} with args:`, content.input);
          
          // Call the MCP tool
          const mcpResult = await this.mcpClient.callTool(content.name, content.input);
          
          let toolResultText = "No result";
          if (mcpResult && mcpResult.content) {
            toolResultText = mcpResult.content
              .filter(c => c.type === 'text')
              .map(c => c.text)
              .join('\n');
          }

          toolResults.push({
            tool: content.name,
            result: toolResultText
          });

          // Add tool result to conversation for Claude's next response
          this.conversationHistory.push({
            role: "assistant",
            content: response.content
          });

          this.conversationHistory.push({
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: content.id,
                content: toolResultText
              }
            ]
          });
        }
      }

      // If we used tools, get Claude's final response incorporating the results
      if (toolResults.length > 0) {
        console.log(`📊 Tool results:`, toolResults);
        
        const finalCompletion = await this.anthropic.messages.create({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 1000,
          system: this.systemPrompt,
          messages: this.conversationHistory,
          tools: tools.length > 0 ? tools : undefined,
        });

        console.log(`finalCompletion after tool use: `, JSON.stringify(finalCompletion, null, 2));

        // Extract text from final response
        finalResponse = "";
        for (const content of finalCompletion.content) {
          if (content.type === 'text') {
            finalResponse += content.text;
          }
        }

        console.log(`finalResponse after tool use: `, finalResponse);

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

        // Send tool results back to Claude
        this.conversationHistory.push({
          role: "assistant",
          content: [...toolCalls, { type: "text", text: fullResponse }]
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
    console.log(`\n🤖 Processing complex query: "${userMessage}"`);
    
    this.conversationHistory.push({
      role: "user",
      content: userMessage
    });

    let currentRound = 0;
    let finalResponse = "";

    try {
      while (currentRound < maxToolRounds) {
        const tools = this.convertMCPToolsToAnthropicFormat();
        
        const response = await this.anthropic.messages.create({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 1000,
          system: this.systemPrompt,
          messages: this.conversationHistory,
          tools: tools.length > 0 ? tools : undefined,
        });

        let hasToolCalls = false;
        const toolResults = [];

        // Process response content
        for (const content of response.content) {
          if (content.type === 'text') {
            finalResponse = content.text;
          } else if (content.type === 'tool_use') {
            hasToolCalls = true;
            console.log(`🔧 Round ${currentRound + 1} - Tool: ${content.name}`);
            
            const mcpResult = await this.mcpClient.callTool(content.name, content.input);
            let toolResultText = "No result";
            
            if (mcpResult && mcpResult.content) {
              toolResultText = mcpResult.content
                .filter(c => c.type === 'text')
                .map(c => c.text)
                .join('\n');
            }

            toolResults.push({
              type: "tool_result",
              tool_use_id: content.id,
              content: toolResultText
            });
          }
        }

        // Add assistant response to history
        this.conversationHistory.push({
          role: "assistant",
          content: response.content
        });

        if (hasToolCalls) {
          // Add tool results and continue
          this.conversationHistory.push({
            role: "user",
            content: toolResults
          });
          currentRound++;
        } else {
          // No more tools needed, we're done
          break;
        }
      }

      return finalResponse;

    } catch (error) {
      console.error('Error in complex query:', error);
      return "I'm sorry, I encountered an error processing your complex request.";
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

  async shutdown() {
    await this.mcpClient.close();
  }
}

export { LLM };

