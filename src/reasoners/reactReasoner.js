import { responseSanitiser } from '../lib/responseSanitiser.js';
import { ToolSemanticScorer } from '../lib/toolSemanticScorer.js';
import { logLlmPayload } from '../lib/llmLogger.js';
import { normalizeToolCalls, requestFinalResponse } from '../lib/toolCallUtils.js';

const DEFAULT_REACT_TURNS = 3;
const OBSERVATION_CHAR_LIMIT = 600;

export class ReactReasoner {
  constructor({ llm, tokenBudget, maxTurns, maxTools }) {
    if (!llm) {
      throw new Error('llm client is required for ReactReasoner');
    }
    this.llm = llm;
    this.tokenBudget = tokenBudget || null;
    const parsedTurns = Number.parseInt(maxTurns, 10);
    this.maxTurns =
      Number.isInteger(parsedTurns) && parsedTurns > 0 ? parsedTurns : DEFAULT_REACT_TURNS;
    this.scorer = new ToolSemanticScorer({ maxTools });
  }

  async run(messages, tools = [], context = {}) {
    if (!Array.isArray(tools) || tools.length === 0) {
      return this._directResponse(messages);
    }

    const workingMessages = [...messages];
    const toolResults = [];

    for (let turn = 0; turn < this.maxTurns; turn += 1) {
      const selectedTools = this.scorer.selectTools(workingMessages, tools);
      if (selectedTools.length === 0) {
        break;
      }

      const boundedTools = this.tokenBudget
        ? this.tokenBudget.limitTools(selectedTools)
        : selectedTools;
      if (boundedTools.length === 0) {
        break;
      }

      const toolMetadata = boundedTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      }));

      const stepMessages = this._injectDirective(workingMessages, turn);
      const boundedMessages = this.tokenBudget
        ? this.tokenBudget.enforceMessageBudget(stepMessages)
        : stepMessages;

      logLlmPayload('ReAct Step', {
        turn: turn + 1,
        messages: boundedMessages,
        tools: toolMetadata,
      });
      const startTime = Date.now();
      const response = await this.llm.chat(boundedMessages, boundedTools);
      const duration = Date.now() - startTime;
      logLlmPayload('ReAct Step Response', { turn: turn + 1, response });
      const inputTokens =
        typeof response?.prompt_eval_count === 'number' ? response.prompt_eval_count : null;
      const outputTokens = typeof response?.eval_count === 'number' ? response.eval_count : null;
      const totalTokens =
        inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null;
      logLlmPayload('ReAct Step Usage', {
        turn: turn + 1,
        inputTokens,
        outputTokens,
        totalTokens,
        durationMs: duration,
      });
      const inputLog = inputTokens ?? 0;
      const outputLog = outputTokens ?? 0;
      console.log(`ReAct Step ${turn + 1}: ${inputLog} in, ${outputLog} out, ${duration}ms`);

      const assistantContent = response?.message?.content || '';
      if (assistantContent) {
        workingMessages.push({ role: 'assistant', content: assistantContent });
      }

      const toolCalls = normalizeToolCalls(response?.message?.tool_calls, assistantContent);
      if (!toolCalls.length) {
        const finalReply = responseSanitiser(assistantContent);
        if (finalReply) {
          return finalReply;
        }
        break;
      }

      const executed = await this._executeToolCall(toolCalls[0], tools, context);
      toolResults.push(executed);
      workingMessages.push({ role: 'user', content: this._formatObservation(executed) });
    }

    if (toolResults.length > 0) {
      return requestFinalResponse({
        llm: this.llm,
        tokenBudget: this.tokenBudget,
        messages,
        toolResults,
        logPrefix: 'ReAct Finalization',
      });
    }

    return this._directResponse(workingMessages);
  }

  _injectDirective(messages, turn) {
    const directive = {
      role: 'system',
      content:
        turn === 0
          ? 'Use ReAct reasoning: write a short Thought, call at most one tool, then wait for an Observation before continuing. Finish with a direct reply when enough information is available.'
          : 'Continue the ReAct loop using the latest Observation. Call at most one tool and finalize with a direct reply when ready.',
    };
    return [directive, ...messages];
  }

  async _executeToolCall(call, tools, context) {
    const toolName = call?.name;
    const safeName = toolName || 'unknown_tool';
    const toolMap = new Map((tools || []).map(tool => [tool.name, tool]));
    if (!toolMap.has(safeName)) {
      return { name: safeName, error: `Tool ${safeName} not found` };
    }

    const tool = toolMap.get(safeName);
    try {
      const args = call?.arguments || {};
      console.log(`ReAct executing ${tool.name}(${JSON.stringify(args)})`);
      const result = await tool.execute(args, context);
      return { name: tool.name, result };
    } catch (error) {
      console.log(`ReAct error ${tool.name}: ${error.message}`);
      return { name: tool.name, error: error.message };
    }
  }

  _formatObservation(entry) {
    const payload = entry.error ? { error: entry.error } : entry.result;
    const serialized = JSON.stringify(payload ?? {});
    const truncated =
      serialized.length > OBSERVATION_CHAR_LIMIT
        ? `${serialized.slice(0, OBSERVATION_CHAR_LIMIT)}...`
        : serialized;
    return `Observation (${entry.name}): ${truncated}`;
  }

  async _directResponse(messages) {
    logLlmPayload('ReAct Direct Response', { messages });
    const startTime = Date.now();
    const response = await this.llm.chat(messages);
    const duration = Date.now() - startTime;
    logLlmPayload('ReAct Direct Response Result', response);
    const inputTokens =
      typeof response?.prompt_eval_count === 'number' ? response.prompt_eval_count : null;
    const outputTokens = typeof response?.eval_count === 'number' ? response.eval_count : null;
    const totalTokens =
      inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null;
    logLlmPayload('ReAct Direct Response Usage', {
      inputTokens,
      outputTokens,
      totalTokens,
      durationMs: duration,
    });
    const inputLog = inputTokens ?? 0;
    const outputLog = outputTokens ?? 0;
    console.log(`ReAct direct: ${inputLog} in, ${outputLog} out, ${duration}ms`);
    const sanitized = responseSanitiser(response?.message?.content || '');
    return sanitized || 'I was unable to generate a response.';
  }
}
