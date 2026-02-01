export class Agent {
  constructor(ollamaClient, tools = [], config = {}) {
    this.ollama = ollamaClient;
    this.tools = tools;
    this.conversationHistory = [];
    this.systemPrompt = this._buildSystemPrompt();
    this.maxHistory = Number.isInteger(config.maxHistory) ? config.maxHistory : 5;
  }

  _buildSystemPrompt() {
    // Optimized for consumer-grade hardware (Gemma 3 27B, Qwen 3 32B)
    // Target: <500 tokens for system + tools. Keep concise for 4K-8K context window.
    const now = new Date().toISOString();
    return `You are a helpful personal assistant. Current time: ${now}

Be concise. Use tools when needed. Ask for clarification if unclear.`;
  }

  _buildToolsDescription(selectedTools) {
    if (selectedTools.length === 0) return '';

    let description = '\n\nTools:\n';
    selectedTools.forEach(tool => {
      description += `- ${tool.name}: ${tool.description}\n`;
    });
    return description;
  }

  _logSelectedTools(selectedTools) {
    const names = selectedTools?.length ? selectedTools.map(tool => tool.name).join(', ') : 'none';
    console.log(`🧰 Tools selected: ${names}`);
  }

  _cleanResponse(text) {
    if (!text) return '';
    return text
      .replace(/<\|assistant\|>/g, '')
      .replace(/<\|user\|>/g, '')
      .replace(/<\|system\|>/g, '')
      .replace(/<s>/g, '')
      .replace(/<\/s>/g, '')
      .replace(/<tool>/g, '')
      .replace(/<\/tool>/g, '')
      .trim();
  }

  async _selectTools(userMessage) {
    const msg = userMessage.toLowerCase();

    // 1. Check for explicit prefixes (highest priority - instant)
    const prefixMatch = userMessage.match(/^([A-Z]+):\s*/);
    if (prefixMatch) {
      const prefix = prefixMatch[1].toLowerCase();

      // Map common prefixes to categories
      const categoryMap = {
        'search': 'search',
        'web': 'search',
        'calc': 'math',
        'math': 'math',
        'file': 'file',
        'system': 'system',
        'weather': 'weather',
        'note': 'notes',
        'todo': 'todos',
        'time': 'time'
      };

      const category = categoryMap[prefix];
      if (category) {
        const tools = this.tools.filter(t => t.category === category);
        if (tools.length > 0) return tools;
      }
    }

    // 2. Keyword-based selection
    const selectedTools = this.tools.filter(t => t.core === true);

    for (const tool of this.tools) {
      if (tool.core) continue;
      if (!tool.keywords) continue;

      const hasKeyword = tool.keywords.some(keyword => msg.includes(keyword));
      if (hasKeyword && !selectedTools.includes(tool)) {
        selectedTools.push(tool);
      }
    }

    return selectedTools;
  }

  async processMessage(userMessage) {
    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: userMessage
    });

    // Keep conversation history manageable for consumer-grade hardware
    if (this.conversationHistory.length > this.maxHistory) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistory);
    }

    // Select relevant tools based on message content (context optimization)
    const selectedTools = await this._selectTools(userMessage);

    this._logSelectedTools(selectedTools);

    // Build system prompt with only selected tools
    const systemPromptWithTools = this.systemPrompt + this._buildToolsDescription(selectedTools);

    // Prepare messages for Ollama
    const messages = [
      { role: 'system', content: systemPromptWithTools },
      ...this.conversationHistory
    ];

    // Convert selected tools to Ollama format
    const ollamaTools = selectedTools.map(tool => ({
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
        return await this._handleToolCalls(response.message, messages, selectedTools);
      }

      // No tool calls, just return the response
      const assistantMessage = this._cleanResponse(response.message.content);
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

  async _handleToolCalls(message, messages, selectedTools) {
    // Add assistant's message with tool calls to history
    this.conversationHistory.push({
      role: 'assistant',
      content: message.content || '',
      tool_calls: message.tool_calls
    });

    const toolResults = [];

    // Execute each tool call
    for (const toolCall of message.tool_calls) {
      const tool = selectedTools.find(t => t.name === toolCall.function.name);

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
    const finalMessage = this._cleanResponse(finalResponse.message.content);

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
