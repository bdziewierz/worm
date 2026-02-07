import { responseSanitiser } from './responseSanitiser.js';
import { logLlmPayload } from './llmLogger.js';

export function normalizeToolCalls(toolCalls, content) {
  const parseJsonObject = text => {
    if (!text) return null;
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  };

  let calls = Array.isArray(toolCalls) ? toolCalls : [];
  if (calls.length === 0 && content) {
    const parsed = parseJsonObject(content);
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

export async function requestFinalResponse({
  llm,
  tokenBudget,
  messages,
  toolResults,
  logPrefix = 'ToolCaller Step 2',
}) {
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

  const boundedMessages = tokenBudget
    ? tokenBudget.enforceMessageBudget(finalMessages)
    : finalMessages;

  logLlmPayload(logPrefix, { messages: boundedMessages });
  const response = await llm.chat(boundedMessages);
  logLlmPayload(`${logPrefix} Response`, response);
  const inputTokens =
    typeof response?.prompt_eval_count === 'number' ? response.prompt_eval_count : null;
  const outputTokens = typeof response?.eval_count === 'number' ? response.eval_count : null;
  const totalTokens =
    inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null;
  const duration = Date.now() - startTime;
  logLlmPayload(`${logPrefix} Usage`, {
    inputTokens,
    outputTokens,
    totalTokens,
    durationMs: duration,
  });
  const inputLog = inputTokens ?? 0;
  const outputLog = outputTokens ?? 0;
  console.log(`${logPrefix}: ${inputLog} in, ${outputLog} out, ${duration}ms`);

  return responseSanitiser(response?.message?.content || '');
}
