import { responseSanitiser } from './responseSanitiser.js';
import { ToolSemanticScorer } from './toolSemanticScorer.js';

export class ToolCaller {
  constructor(llmClient, options = {}) {
    this.llm = llmClient;
    this.scorer = new ToolSemanticScorer({ maxTools: options.maxTools });
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

  _normalizeToolCalls(toolCalls, content) {
    let calls = Array.isArray(toolCalls) ? toolCalls : [];
    if (calls.length === 0 && content) {
      const parsed = this._parseJsonObject(content);
      if (parsed && Array.isArray(parsed.tool_calls)) {
        calls = parsed.tool_calls;
      }
    }

    return calls
      .map(call => {
        const name = call?.function?.name || call?.name;
        if (!name) return null;
        let args = call?.function?.arguments ?? call?.arguments ?? {};
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args);
          } catch {
            args = {};
          }
        }
        if (typeof args !== 'object' || args === null) {
          args = {};
        }
        return { name, arguments: args };
      })
      .filter(Boolean);
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
    console.log(`📊 Step 2: ${inputTokens} in, ${outputTokens} out, ${duration}ms`);

    return responseSanitiser(response?.message?.content || '');
  }

  _buildToolSummary(toolCalls = []) {
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
      return '';
    }

    const lines = toolCalls.map(call => {
      const name = call?.name || 'unknown_tool';
      const args = call?.arguments || {};
      const argsText = Object.keys(args).length > 0 ? JSON.stringify(args) : '{}';
      return `- ${name} ${argsText}`;
    });

    return `\n\nTool calls:\n${lines.join('\n')}`;
  }

  async run(messages, tools, context = {}) {
    const execContext = {
      userId: context?.userId ?? null,
      roomId: context?.roomId ?? null,
      services: context?.services || {},
    };

    const selectedTools = this.scorer.selectTools(messages, tools);
    const selectedNames = selectedTools.map(tool => tool.name).join(', ');
    console.log(`🔎 Semantic tool selection: ${selectedNames || 'none'}`);

    const startTime = Date.now();
    const response = await this.llm.chat(messages, selectedTools);
    const duration = Date.now() - startTime;
    const inputTokens = response?.prompt_eval_count || 0;
    const outputTokens = response?.eval_count || 0;
    console.log(`📊 Step 1: ${inputTokens} in, ${outputTokens} out, ${duration}ms`);

    const toolCalls = this._normalizeToolCalls(
      response?.message?.tool_calls,
      response?.message?.content
    );

    if (!toolCalls.length) {
      return responseSanitiser(response?.message?.content || '');
    }

    const toolMap = new Map((tools || []).map(tool => [tool.name, tool]));
    const toolResults = [];

    console.log('⚙️  Executing tools...');
    for (const call of toolCalls) {
      const toolName = call?.name;
      const tool = toolMap.get(String(toolName));
      if (!tool) {
        console.log(`❌ Tool "${toolName}" not found`);
        toolResults.push({ name: toolName, error: `Tool ${toolName} not found` });
        continue;
      }

      try {
        const args = call?.arguments || {};
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

    console.log('💬 Generating final response...');
    const finalText = await this._requestFinalResponse(messages, toolResults);
    const summary = this._buildToolSummary(toolCalls);
    return summary ? `${finalText}${summary}` : finalText;
  }
}
