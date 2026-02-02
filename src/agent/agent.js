import { ToolCaller } from '../lib/toolCaller.js';
import { responseSanitiser } from '../lib/responseSanitiser.js';

export class Agent {
  constructor(ollamaClient, tools = [], config = {}) {
    this.ollama = ollamaClient;
    this.tools = tools;
    this.conversationHistory = [];
    this.name = config.name || 'WORM Assistant';
    this.personality = config.personality || 'Helpful, concise, and direct.';
    this.background = config.background || '';
    this.speakingStyle = config.speakingStyle || '';
    this.systemPrompt = this._buildSystemPrompt();
    this.maxHistory = Number.isInteger(config.maxHistory) ? config.maxHistory : 5;
    this.toolCaller = new ToolCaller(ollamaClient);
  }

  _buildSystemPrompt(userName = null) {
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
    }

    prompt += `\n\nBe concise. Ask for clarification if unclear.`;

    return prompt;
  }

  async processMessage(userMessage, userName = null) {
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
      { role: 'system', content: this._buildSystemPrompt(userName) },
      ...this.conversationHistory,
    ];

    try {
      let assistantMessage;

      if (this.tools.length > 0) {
        assistantMessage = await this.toolCaller.run(messages, this.tools);
      } else {
        const response = await this.ollama.chat(messages);
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
