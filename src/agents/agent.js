import { ToolCaller } from '../lib/toolCaller.js';
import { responseSanitiser } from '../lib/responseSanitiser.js';
import { Memory } from '../lib/memory.js';
import { logLlmPayload, resetLlmLog } from '../lib/llmLogger.js';
import { TokenBudgetManager } from '../lib/tokenBudgetManager.js';
import { HistoryStore } from '../lib/historyStore.js';
import { createReasoner } from '../reasoners/index.js';

export class Agent {
  constructor(llmClient, tools = [], config = {}) {
    this.llm = llmClient;
    this.tools = tools;
    this.name = config.name || 'WORM Assistant';
    this.personality = config.personality || 'Helpful, concise, and direct.';
    this.background = config.background || '';
    this.speakingStyle = config.speakingStyle || '';
    this.systemPrompt = this._buildSystemPrompt();
    this.maxHistory = Number.isInteger(config.maxHistory) ? config.maxHistory : null;
    this.maxTools = Number.isInteger(config.maxTools) ? config.maxTools : null;
    this.tokenBudget = new TokenBudgetManager({
      maxContextTokens: config.maxContextTokens,
      responseBufferTokens: config.responseBufferTokens,
      maxToolContextTokens: config.maxToolContextTokens,
    });
    this.toolCaller = new ToolCaller(llmClient, {
      tokenBudget: this.tokenBudget,
      maxTools: this.maxTools,
    });
    this.reasoner = createReasoner(config.reasoningMode, {
      llm: this.llm,
      toolCaller: this.toolCaller,
      tokenBudget: this.tokenBudget,
      maxTurns: config.maxReasoningTurns,
      maxTools: this.maxTools,
    });
    this.memory = new Memory();
    this.historyStore = config.historyStore || new HistoryStore();
    this.services = config.services || {};
  }

  async _buildSystemPrompt(userName = null) {
    const now = new Date().toISOString();
    let prompt = `You are ${this.name}. Personality: ${this.personality}`;

    if (this.background) {
      prompt += ` ${this.background}`;
    }

    if (this.speakingStyle) {
      prompt += ` Speaking style: ${this.speakingStyle}`;
    }

    prompt += ` Current time: ${now}`;

    if (userName) {
      prompt += `\n\nYou are talking to: ${userName}`;

      // Load user facts from memory
      const facts = await this.memory.getUserFacts(userName);
      if (facts.length > 0) {
        prompt += `\n\nWhat you know about ${userName}:\n${facts.map(f => `- ${f}`).join('\n')}`;
      }
    }

    prompt += `\n\nBe concise. Ask for clarification if unclear.`;

    return prompt;
  }

  async processMessage(userMessage, metadata = {}) {
    const { userId = null, roomId = null, systemPromptAddon = '' } = metadata || {};
    const userName = userId;
    resetLlmLog();
    const historyKey = this._resolveHistoryKey(metadata);
    const existingHistory = historyKey ? await this.historyStore.getHistory(historyKey) : [];
    const userEntry = {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    };
    let workingHistory = [...existingHistory, userEntry];
    workingHistory = this._enforceMaxHistory(workingHistory);

    const baseSystemPrompt = await this._buildSystemPrompt(userName);
    const systemPrompt = systemPromptAddon
      ? `${baseSystemPrompt}\n\n${systemPromptAddon}`
      : baseSystemPrompt;
    const rawMessages = [
      { role: 'system', content: systemPrompt },
      ...this._historyEntriesToMessages(workingHistory),
    ];
    const messages = this.tokenBudget.enforceMessageBudget(rawMessages);
    const boundedHistory = historyKey
      ? this._reconcileHistoryEntries(messages.slice(1), workingHistory)
      : workingHistory;

    try {
      let assistantMessage;

      if (this.tools.length > 0 && this.reasoner) {
        assistantMessage = await this.reasoner.run(messages, this.tools, {
          userId,
          roomId,
          services: this.services,
        });
      } else {
        logLlmPayload('Agent', { messages });
        const startTime = Date.now();
        const response = await this.llm.chat(messages);
        const duration = Date.now() - startTime;
        logLlmPayload('Agent Response', response);
        const inputTokens =
          typeof response?.prompt_eval_count === 'number' ? response.prompt_eval_count : null;
        const outputTokens = typeof response?.eval_count === 'number' ? response.eval_count : null;
        const totalTokens =
          inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null;
        logLlmPayload('Agent Usage', {
          inputTokens,
          outputTokens,
          totalTokens,
          durationMs: duration,
        });
        assistantMessage = responseSanitiser(response?.message?.content);
      }

      if (!assistantMessage) {
        console.warn('Warning: Empty response from LLM');
        assistantMessage =
          'I apologize, but I forgot what I wanted to say. This might be a temporary issue. Could you please ask your question again?';
      }

      if (historyKey) {
        const assistantEntry = {
          role: 'assistant',
          content: assistantMessage,
          timestamp: new Date().toISOString(),
        };
        let finalHistory = [...boundedHistory, assistantEntry];
        finalHistory = this._enforceMaxHistory(finalHistory);
        await this.historyStore.setHistory(historyKey, finalHistory);
      }

      return assistantMessage;
    } catch (error) {
      console.error('Error processing message:', error);
      throw error;
    }
  }

  async clearHistory(userId = null) {
    if (userId) {
      await this.historyStore.clearHistory(`user:${userId}`);
      return;
    }
    await this.historyStore.clearAll();
  }

  _resolveHistoryKey(metadata = {}) {
    if (metadata.persistHistory === false) {
      return null;
    }
    if (metadata.userId) {
      return `user:${metadata.userId}`;
    }
    if (metadata.roomId) {
      return `room:${metadata.roomId}`;
    }
    if (metadata.jobId) {
      return `job:${metadata.jobId}`;
    }
    if (metadata.source) {
      return `source:${metadata.source}`;
    }
    return null;
  }

  _historyEntriesToMessages(entries = []) {
    return entries.map(entry => ({ role: entry.role, content: entry.content }));
  }

  _enforceMaxHistory(entries = []) {
    if (!Number.isInteger(this.maxHistory) || this.maxHistory <= 0) {
      return entries;
    }
    if (entries.length <= this.maxHistory) {
      return entries;
    }
    return entries.slice(-this.maxHistory);
  }

  _reconcileHistoryEntries(trimmedMessages = [], originalHistory = []) {
    if (!Array.isArray(trimmedMessages) || trimmedMessages.length === 0) {
      return [];
    }
    if (!Array.isArray(originalHistory) || originalHistory.length === 0) {
      return [];
    }

    const reconciled = [];
    let searchStart = 0;

    for (const trimmed of trimmedMessages) {
      const index = originalHistory.findIndex((entry, idx) => {
        return (
          idx >= searchStart && entry.role === trimmed.role && entry.content === trimmed.content
        );
      });
      if (index === -1) {
        continue;
      }
      reconciled.push(originalHistory[index]);
      searchStart = index + 1;
    }

    return reconciled;
  }
}
