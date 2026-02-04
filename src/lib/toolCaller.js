import { responseSanitiser } from './responseSanitiser.js';

export class ToolCaller {
  constructor(llmClient) {
    this.llm = llmClient;
  }

  _buildToolList(tools) {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
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
    const systemPrompt =
      `Task: Determine if any tools are needed to answer the user's request.\n` +
      `IMPORTANT: Most messages do NOT need tools. Only use tools for explicit requests.\n\n` +
      `DO NOT use tools for:\n` +
      `- Casual conversation, greetings, venting, complaints\n` +
      `- Questions you can answer from general knowledge\n` +
      `- Statements that don't ask for anything\n` +
      `- Emotional expressions or small talk\n\n` +
      `USE tools for:\n` +
      `- Explicit requests (calculate, weather, search, etc.)\n` +
      `- Questions requiring real-time data or computation\n` +
      `- Storing important facts user shares (preferences, projects, context) - use remember tool\n\n` +
      `CRITICAL: Some tools generate data (passwords, UUIDs, hashes). ALWAYS call these tools.\n` +
      `NEVER simulate or hallucinate their outputs. If user requests password/UUID/hash, call the tool.\n\n` +
      `Rules: If tools needed: Output {"tool_calls": [{"name": "tool_name"}]}. ` +
      `If no tools needed: Answer directly in plain text, never mention tools.\n\n` +
      `Available tools: ${toolList}\n`;

    const response = await this.llm.chat(
      [{ role: 'system', content: systemPrompt }, ...messages],
      null,
      { responseFormat: 'json' }
    );

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
      response: '',
    };
  }

  async _requestToolArgs(messages, selectedToolNames, tools, userMessage) {
    const startTime = Date.now();

    // Only include schemas for selected tools
    const selectedTools = tools.filter(tool => selectedToolNames.includes(tool.name));
    if (typeof this.llm?.requestToolArgs !== 'function') {
      throw new Error('Active LLM client does not support tool argument extraction');
    }

    const result = await this.llm.requestToolArgs(messages, selectedTools, userMessage);

    const duration = Date.now() - startTime;
    const inputTokens = result?.prompt_eval_count || 0;
    const outputTokens = result?.eval_count || 0;
    console.log(`📊 Step 2: ${inputTokens} in, ${outputTokens} out, ${duration}ms`);

    const toolCalls = Array.isArray(result)
      ? result
      : Array.isArray(result?.tool_calls)
        ? result.tool_calls
        : [];

    return toolCalls;
  }

  async _requestFinalResponse(messages, toolResults) {
    const startTime = Date.now();
    const systemPrompt =
      `Tool execution results: ${JSON.stringify(toolResults)}\n\n` +
      `Task: Answer the user's question using ONLY the results above.\n` +
      `Rules: Do NOT call any tools. Do NOT output JSON. Write a natural, conversational response.`;

    const response = await this.llm.chat([
      { role: 'system', content: systemPrompt },
      ...messages,
      { role: 'user', content: `Tool results: ${JSON.stringify(toolResults)}` },
    ]);

    const duration = Date.now() - startTime;
    const inputTokens = response?.prompt_eval_count || 0;
    const outputTokens = response?.eval_count || 0;
    console.log(`📊 Step 3: ${inputTokens} in, ${outputTokens} out, ${duration}ms`);

    return responseSanitiser(response?.message?.content || '');
  }

  async run(messages, tools, context = {}) {
    const execContext = {
      userId: context?.userId ?? null,
      roomId: context?.roomId ?? null,
      services: context?.services || {},
    };
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
    const argCalls = await this._requestToolArgs(messages, selectedToolNames, tools, userMessage);
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
        const toolContext = {
          userId: execContext.userId,
          roomId: execContext.roomId,
          services: execContext.services,
        };
        console.log(`   🔧 ${tool.name}(${JSON.stringify(args)})`);
        const result = await tool.execute(args, toolContext);
        console.log(
          `   ✓ ${tool.name} → ${JSON.stringify(result).substring(0, 100)}${JSON.stringify(result).length > 100 ? '...' : ''}`
        );
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
