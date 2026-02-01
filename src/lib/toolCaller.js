export class ToolCaller {
  constructor(ollamaClient) {
    this.ollama = ollamaClient;
  }

  _buildToolList(tools) {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description
    }));
  }

  _parseJsonObject(text) {
    if (!text) return null;
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
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

  async _requestToolDecision(messages, tools) {
    const toolList = JSON.stringify(this._buildToolList(tools));
    const systemPrompt = `You are a tool router. Return ONLY JSON with keys: tool_calls (array) and response (string).\n` +
      `tool_calls items: {"name": "tool_name"}. Do NOT include arguments.\n` +
      `If no tool is needed, return tool_calls: [] and response with the final answer.\n` +
      `Tools: ${toolList}`;

    const response = await this.ollama.chat([
      { role: 'system', content: systemPrompt },
      ...messages
    ]);

    const parsed = this._parseJsonObject(response?.message?.content);
    if (!parsed) {
      return { tool_calls: [], response: this._cleanResponse(response?.message?.content) };
    }

    const toolCalls = Array.isArray(parsed.tool_calls) ? parsed.tool_calls : [];
    return {
      tool_calls: toolCalls,
      response: typeof parsed.response === 'string' ? parsed.response : ''
    };
  }

  async _requestToolArgsBatch(messages, tools, userMessage) {
    const schemas = tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters || {}
    }));

    const systemPrompt = `Return ONLY JSON with key: tool_calls (array).\n` +
      `Each item: {"name": "tool_name", "arguments": {}}.\n` +
      `Use only tools from this list: ${JSON.stringify(schemas)}.`;

    const response = await this.ollama.chat([
      { role: 'system', content: systemPrompt },
      ...messages,
      { role: 'user', content: userMessage }
    ]);

    const parsed = this._parseJsonObject(response?.message?.content);
    if (!parsed || !Array.isArray(parsed.tool_calls)) {
      return [];
    }
    return parsed.tool_calls;
  }

  async _requestFinalResponse(messages, toolResults) {
    const systemPrompt = `Use the tool results below to compose a helpful, natural language response to the user's question.`;

    const response = await this.ollama.chat([
      { role: 'system', content: systemPrompt },
      ...messages,
      { role: 'user', content: `Tool results: ${JSON.stringify(toolResults)}` }
    ]);

    return this._cleanResponse(response?.message?.content || '');
  }

  async run(messages, tools) {
    const decision = await this._requestToolDecision(messages, tools);

    if (!decision.tool_calls || decision.tool_calls.length === 0) {
      console.log('🔀 Step 1: No tools selected');
      return this._cleanResponse(decision.response);
    }

    const selectedToolNames = decision.tool_calls.map(call =>
      typeof call === 'object' && call !== null ? call.name : call
    );
    console.log(`🔀 Step 1: Selected tools: ${selectedToolNames.join(', ')}`);

    const toolMap = new Map(tools.map(tool => [tool.name, tool]));
    const toolResults = [];

    const userMessage = messages[messages.length - 1]?.content || '';
    const argCalls = await this._requestToolArgsBatch(messages, tools, userMessage);
    const argMap = new Map(
      argCalls
        .filter(call => call && call.name)
        .map(call => [String(call.name), call.arguments || {}])
    );

    console.log('⚙️  Step 2: Executing tools...');
    for (const call of decision.tool_calls) {
      const toolName = typeof call === 'object' && call !== null ? call.name : call;
      const tool = toolMap.get(String(toolName));
      if (!tool) {
        console.log(`❌ Tool "${toolName}" not found`);
        toolResults.push({ name: toolName, error: `Tool ${toolName} not found` });
        continue;
      }
      try {
        const args = argMap.get(String(toolName)) || {};
        console.log(`   🔧 ${tool.name}(${JSON.stringify(args)})`);
        const result = await tool.execute(args);
        console.log(`   ✓ ${tool.name} → ${JSON.stringify(result).substring(0, 100)}${JSON.stringify(result).length > 100 ? '...' : ''}`);
        toolResults.push({ name: tool.name, result });
      } catch (error) {
        console.log(`   ❌ ${tool.name} error: ${error.message}`);
        toolResults.push({ name: tool.name, error: error.message });
      }
    }

    console.log('💬 Step 3: Generating final response...');
    const finalText = await this._requestFinalResponse(messages, toolResults);
    return this._cleanResponse(finalText);
  }
}
