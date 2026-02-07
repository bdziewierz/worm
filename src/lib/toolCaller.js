import { responseSanitiser } from './responseSanitiser.js';
import { ToolSemanticScorer } from './toolSemanticScorer.js';
import { logLlmPayload } from './llmLogger.js';
import { normalizeToolCalls, requestFinalResponse } from './toolCallUtils.js';

export class ToolCaller {
  constructor(llmClient, options = {}) {
    this.llm = llmClient;
    this.scorer = new ToolSemanticScorer({ maxTools: options.maxTools });
    this.tokenBudget = options.tokenBudget || null;
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

    const toolCalls = normalizeToolCalls(response?.message?.tool_calls, response?.message?.content);

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
    return requestFinalResponse({
      llm: this.llm,
      tokenBudget: this.tokenBudget,
      messages,
      toolResults,
    });
  }
}
