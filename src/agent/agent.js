import { ToolCaller } from '../lib/toolCaller.js';
import { responseSanitiser } from '../lib/responseSanitiser.js';
import { Memory } from '../lib/memory.js';

export class Agent {
  constructor(llmClient, tools = [], config = {}) {
    this.llm = llmClient;
    this.tools = tools;
    this.conversationHistory = [];
    this.name = config.name || 'WORM Assistant';
    this.personality = config.personality || 'Helpful, concise, and direct.';
    this.background = config.background || '';
    this.speakingStyle = config.speakingStyle || '';
    this.systemPrompt = this._buildSystemPrompt();
    this.maxHistory = Number.isInteger(config.maxHistory) ? config.maxHistory : 5;
    this.toolCaller = new ToolCaller(llmClient);
    this.memory = new Memory();
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
    const { userId = null, roomId = null } = metadata || {};
    const userName = userId;
    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: userMessage,
    });

    // Keep conversation history manageable
    if (this.conversationHistory.length > this.maxHistory) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistory);
    }

    const messages = [
      { role: 'system', content: await this._buildSystemPrompt(userName) },
      ...this.conversationHistory,
    ];

    try {
      let assistantMessage;

      if (this.tools.length > 0) {
        assistantMessage = await this.toolCaller.run(messages, this.tools, {
          userId,
          roomId,
          services: this.services,
        });
      } else {
        const response = await this.llm.chat(messages);
        assistantMessage = responseSanitiser(response?.message?.content);
      }

      if (!assistantMessage) {
        console.warn('⚠️ Empty response from LLM');
        assistantMessage =
          'I apologize, but I forgot what I wanted to say. This might be a temporary issue. Could you please ask your question again?';
      }

      this.conversationHistory.push({
        role: 'assistant',
        content: assistantMessage,
      });

      return assistantMessage;
    } catch (error) {
      console.error('Error processing message:', error);
      throw error;
    }
  }

  clearHistory() {
    this.conversationHistory = [];
  }
}
