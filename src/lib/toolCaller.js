import { responseSanitiser } from './responseSanitiser.js';
import { ToolSemanticScorer } from './toolSemanticScorer.js';
import { logLlmPayload } from './llmLogger.js';

export class ToolCaller {
  constructor(llmClient, options = {}) {
    this.llm = llmClient;
    this.scorer = new ToolSemanticScorer({ maxTools: options.maxTools });
    this.tokenBudget = options.tokenBudget || null;
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

    const finalMessages = [
      { role: 'system', content: systemPrompt },
      ...messages,
      { role: 'user', content: `Tool results: ${JSON.stringify(toolResults)}` },
    ];

    const boundedMessages = this.tokenBudget
      ? this.tokenBudget.enforceMessageBudget(finalMessages)
      : finalMessages;

    logLlmPayload('ToolCaller Step 2', { messages: boundedMessages });
    const response = await this.llm.chat(boundedMessages);
    logLlmPayload('ToolCaller Step 2 Response', response);
    const step2InputTokens =
      typeof response?.prompt_eval_count === 'number' ? response.prompt_eval_count : null;
    const step2OutputTokens = typeof response?.eval_count === 'number' ? response.eval_count : null;
    const step2TotalTokens =
      step2InputTokens !== null && step2OutputTokens !== null
        ? step2InputTokens + step2OutputTokens
        : null;
    const duration = Date.now() - startTime;
    logLlmPayload('ToolCaller Step 2 Usage', {
      inputTokens: step2InputTokens,
      outputTokens: step2OutputTokens,
      totalTokens: step2TotalTokens,
      durationMs: duration,
    });
    const step2InputLog = step2InputTokens ?? 0;
    const step2OutputLog = step2OutputTokens ?? 0;
    console.log(`Step 2: ${step2InputLog} in, ${step2OutputLog} out, ${duration}ms`);

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
    const boundedTools = this.tokenBudget
      ? this.tokenBudget.limitTools(selectedTools)
      : selectedTools;
    const selectedNames = boundedTools.map(tool => tool.name).join(', ');
    console.log(`Semantic tool selection: ${selectedNames || 'none'}`);

    const startTime = Date.now();
    const toolMetadata = boundedTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));

    logLlmPayload('ToolCaller Step 1', { messages, tools: toolMetadata });
    const response = await this.llm.chat(messages, boundedTools);
    logLlmPayload('ToolCaller Step 1 Response', response);
    const step1InputTokens =
      typeof response?.prompt_eval_count === 'number' ? response.prompt_eval_count : null;
    const step1OutputTokens = typeof response?.eval_count === 'number' ? response.eval_count : null;
    const step1TotalTokens =
      step1InputTokens !== null && step1OutputTokens !== null
        ? step1InputTokens + step1OutputTokens
        : null;
    const duration = Date.now() - startTime;
    logLlmPayload('ToolCaller Step 1 Usage', {
      inputTokens: step1InputTokens,
      outputTokens: step1OutputTokens,
      totalTokens: step1TotalTokens,
      durationMs: duration,
    });
    const step1InputLog = step1InputTokens ?? 0;
    const step1OutputLog = step1OutputTokens ?? 0;
    console.log(`Step 1: ${step1InputLog} in, ${step1OutputLog} out, ${duration}ms`);

    const toolCalls = this._normalizeToolCalls(
      response?.message?.tool_calls,
      response?.message?.content
    );

    if (!toolCalls.length) {
      return responseSanitiser(response?.message?.content || '');
    }

    const toolMap = new Map((tools || []).map(tool => [tool.name, tool]));
    const toolResults = [];

    console.log('Executing tools...');
    for (const call of toolCalls) {
      const toolName = call?.name;
      const tool = toolMap.get(String(toolName));
      if (!tool) {
        console.log(`Tool "${toolName}" not found`);
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
        console.log(`   Tool ${tool.name}(${JSON.stringify(args)})`);
        const result = await tool.execute(args, toolContext);
        console.log(
          `   Success ${tool.name} -> ${JSON.stringify(result).substring(0, 100)}${JSON.stringify(result).length > 100 ? '...' : ''}`
        );
        toolResults.push({ name: tool.name, result });
      } catch (error) {
        console.log(`   Error ${tool.name}: ${error.message}`);
        toolResults.push({ name: tool.name, error: error.message });
      }
    }

    console.log('Generating final response...');
    const finalText = await this._requestFinalResponse(messages, toolResults);
    const summary = this._buildToolSummary(toolCalls);
    return summary ? `${finalText}${summary}` : finalText;
  }
}
