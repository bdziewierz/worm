export class Agent {
  constructor(ollamaClient, tools = []) {
    this.ollama = ollamaClient;
    this.tools = tools;
    this.conversationHistory = [];
    this.systemPrompt = this._buildSystemPrompt();
  }

  _buildSystemPrompt() {
    // Optimized for consumer-grade hardware (Gemma 3 27B, Qwen 3 32B)
    // Target: <500 tokens for system + tools. Keep concise for 4K-8K context window.
    const now = new Date().toISOString();
    let prompt = `You are a helpful personal assistant. Current time: ${now}

Be concise. Use tools when needed. Ask for clarification if unclear.`;

    if (this.tools.length > 0) {
      prompt += `\n\nTools:\n`;
      this.tools.forEach(tool => {
        prompt += `- ${tool.name}: ${tool.description}\n`;
      });
    }

    return prompt;
  }

  async processMessage(userMessage) {
    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: userMessage
    });

    // Keep conversation history manageable for consumer-grade hardware
    // Limit: 10 messages for 4K-8K token context window (Gemma 3 27B, Qwen 3 32B @ Q4)
    if (this.conversationHistory.length > 10) {
      this.conversationHistory = this.conversationHistory.slice(-10);
    }

    // Prepare messages for Ollama
    const messages = [
      { role: 'system', content: this.systemPrompt },
      ...this.conversationHistory
    ];

    // Convert tools to Ollama format
    const ollamaTools = this.tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));

    try {
      // Get response from Ollama
      const response = await this.ollama.chat(messages, ollamaTools);

      // Check if tool calls are requested
      if (response.message.tool_calls && response.message.tool_calls.length > 0) {
        return await this._handleToolCalls(response.message, messages);
      }

      // No tool calls, just return the response
      const assistantMessage = response.message.content;
      this.conversationHistory.push({
        role: 'assistant',
        content: assistantMessage
      });

      return assistantMessage;

    } catch (error) {
      console.error('Error processing message:', error);
      throw error;
    }
  }

  async _handleToolCalls(message, messages) {
    // Add assistant's message with tool calls to history
    this.conversationHistory.push({
      role: 'assistant',
      content: message.content || '',
      tool_calls: message.tool_calls
    });

    const toolResults = [];

    // Execute each tool call
    for (const toolCall of message.tool_calls) {
      const tool = this.tools.find(t => t.name === toolCall.function.name);

      if (!tool) {
        toolResults.push({
          role: 'tool',
          content: `Error: Tool ${toolCall.function.name} not found`,
          name: toolCall.function.name
        });
        continue;
      }

      try {
        const args = toolCall.function.arguments;
        const result = await tool.execute(args);

        toolResults.push({
          role: 'tool',
          content: JSON.stringify(result),
          name: toolCall.function.name
        });
      } catch (error) {
        toolResults.push({
          role: 'tool',
          content: `Error executing tool: ${error.message}`,
          name: toolCall.function.name
        });
      }
    }

    // Add tool results to history
    this.conversationHistory.push(...toolResults);

    // Get final response from Ollama with tool results
    const finalMessages = [
      { role: 'system', content: this.systemPrompt },
      ...this.conversationHistory
    ];

    const finalResponse = await this.ollama.chat(finalMessages);
    const finalMessage = finalResponse.message.content;

    this.conversationHistory.push({
      role: 'assistant',
      content: finalMessage
    });

    return finalMessage;
  }

  clearHistory() {
    this.conversationHistory = [];
  }
}
