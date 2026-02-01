import { responseSanitiser } from './responseSanitiser.js';

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

  async _routeTools(messages, tools) {
    const startTime = Date.now();
    const toolList = JSON.stringify(this._buildToolList(tools));
    const systemPrompt = `Available tools: ${toolList}\n\n` +
      `Task: Determine if any tools are needed to answer the user's request.\n` +
      `If tools needed: Output {"tool_calls": [{"name": "tool_name"}]}\n` +
      `If no tools needed: Answer directly in plain text.`;

    const response = await this.ollama.chat([
      { role: 'system', content: systemPrompt },
      ...messages
    ]);

    const duration = Date.now() - startTime;
    const inputTokens = response?.prompt_eval_count || 0;
    const outputTokens = response?.eval_count || 0;
    console.log(`📊 Step 1: ${inputTokens} in, ${outputTokens} out, ${duration}ms`);

    const parsed = this._parseJsonObject(response?.message?.content);
    if (!parsed) {
      // No JSON found, treat as direct answer
      return { tool_calls: [], response: responseSanitiser(response?.message?.content) };
    }

    const toolCalls = Array.isArray(parsed.tool_calls) ? parsed.tool_calls : [];
    return {
      tool_calls: toolCalls,
      response: ''
    };
  }

  async _requestToolArgs(messages, tools, userMessage) {
    const startTime = Date.now();
    const schemas = tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters || {}
    }));

    const systemPrompt = `Tools with parameters: ${JSON.stringify(schemas)}\n\n` +
      `Task: Extract arguments for each tool from the conversation.\n` +
      `Output: {"tool_calls": [{"name": "tool_name", "arguments": {...}}]}`;

    const response = await this.ollama.chat([
      { role: 'system', content: systemPrompt },
      ...messages,
      { role: 'user', content: userMessage }
    ]);

    const duration = Date.now() - startTime;
    const inputTokens = response?.prompt_eval_count || 0;
    const outputTokens = response?.eval_count || 0;
    console.log(`📊 Step 2: ${inputTokens} in, ${outputTokens} out, ${duration}ms`);

    const parsed = this._parseJsonObject(response?.message?.content);
    if (!parsed || !Array.isArray(parsed.tool_calls)) {
      return [];
    }
    return parsed.tool_calls;
  }

  async _requestFinalResponse(messages, toolResults) {
    const startTime = Date.now();
    const systemPrompt = `Tool execution results: ${JSON.stringify(toolResults)}\n\n` +
      `Task: Use the results above to answer the user's question.`;

    const response = await this.ollama.chat([
      { role: 'system', content: systemPrompt },
      ...messages,
      { role: 'user', content: `Tool results: ${JSON.stringify(toolResults)}` }
    ]);

    const duration = Date.now() - startTime;
    const inputTokens = response?.prompt_eval_count || 0;
    const outputTokens = response?.eval_count || 0;
    console.log(`📊 Step 3: ${inputTokens} in, ${outputTokens} out, ${duration}ms`);

    return responseSanitiser(response?.message?.content || '');
  }

  async run(messages, tools) {
    const decision = await this._routeTools(messages, tools);

    if (!decision.tool_calls || decision.tool_calls.length === 0) {
      console.log('🔀 Step 1: No tools selected');
      return responseSanitiser(decision.response);
    }

    const selectedToolNames = decision.tool_calls.map(call =>
      typeof call === 'object' && call !== null ? call.name : call
    );
    console.log(`🔀 Step 1: Selected tools: ${selectedToolNames.join(', ')}`);

    const toolMap = new Map(tools.map(tool => [tool.name, tool]));
    const toolResults = [];

    const userMessage = messages[messages.length - 1]?.content || '';
    const argCalls = await this._requestToolArgs(messages, tools, userMessage);
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
    return finalText;
  }
}
