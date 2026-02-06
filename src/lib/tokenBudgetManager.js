const AVG_CHARS_PER_TOKEN = 4;
const DEFAULT_MAX_CONTEXT_TOKENS = 16000;
const DEFAULT_RESPONSE_BUFFER_TOKENS = 1024;
const DEFAULT_MAX_TOOL_TOKENS = 4000;

const stringifySafe = value => {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value ?? '');
  } catch {
    return '';
  }
};

const estimateTokensFromString = text => {
  if (!text) return 0;
  return Math.ceil(text.length / AVG_CHARS_PER_TOKEN);
};

const cloneMessages = messages => messages.map(message => ({ ...message }));

export class TokenBudgetManager {
  constructor(options = {}) {
    this.maxContextTokens = Number.isInteger(options.maxContextTokens)
      ? options.maxContextTokens
      : DEFAULT_MAX_CONTEXT_TOKENS;
    this.responseBufferTokens = Number.isInteger(options.responseBufferTokens)
      ? options.responseBufferTokens
      : DEFAULT_RESPONSE_BUFFER_TOKENS;
    this.maxToolContextTokens = Number.isInteger(options.maxToolContextTokens)
      ? options.maxToolContextTokens
      : DEFAULT_MAX_TOOL_TOKENS;
  }

  estimateTokensForMessage(message = {}) {
    return estimateTokensFromString(message?.content || '');
  }

  estimateTokensForMessages(messages = []) {
    return messages.reduce((total, message) => total + this.estimateTokensForMessage(message), 0);
  }

  enforceMessageBudget(messages = []) {
    if (!Array.isArray(messages) || messages.length === 0) {
      return [];
    }

    const allowedTokens = Math.max(this.maxContextTokens - this.responseBufferTokens, 0);
    if (allowedTokens === 0) {
      return [messages[messages.length - 1]];
    }

    const bounded = cloneMessages(messages);
    while (bounded.length > 1 && this.estimateTokensForMessages(bounded) > allowedTokens) {
      bounded.splice(1, 1);
    }
    return bounded;
  }

  estimateTokensForTool(tool = {}) {
    const nameTokens = estimateTokensFromString(tool?.name);
    const descriptionTokens = estimateTokensFromString(tool?.description);
    const parameterTokens = estimateTokensFromString(stringifySafe(tool?.parameters));
    return nameTokens + descriptionTokens + parameterTokens;
  }

  limitTools(tools = []) {
    if (!Array.isArray(tools) || tools.length === 0) {
      return [];
    }

    const budget = Math.max(this.maxToolContextTokens, 0);
    if (budget === 0) {
      return [tools[0]];
    }

    const limited = [];
    let remaining = budget;

    for (const tool of tools) {
      const estimated = this.estimateTokensForTool(tool);
      if (limited.length === 0 && estimated > remaining) {
        limited.push(tool);
        break;
      }
      if (estimated <= remaining) {
        limited.push(tool);
        remaining -= estimated;
      } else {
        break;
      }
    }

    return limited.length > 0 ? limited : [tools[0]];
  }
}

export const tokenBudgetDefaults = {
  AVG_CHARS_PER_TOKEN,
  DEFAULT_MAX_CONTEXT_TOKENS,
  DEFAULT_RESPONSE_BUFFER_TOKENS,
  DEFAULT_MAX_TOOL_TOKENS,
};
