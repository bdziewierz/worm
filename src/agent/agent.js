import { ToolCaller } from '../lib/toolCaller.js';

export class Agent {
  constructor(ollamaClient, tools = [], config = {}) {
    this.ollama = ollamaClient;
    this.tools = tools;
    this.conversationHistory = [];
    this.name = config.name || 'WORM Assistant';
    this.personality = config.personality || 'Helpful, concise, and direct.';
    this.systemPrompt = this._buildSystemPrompt();
    this.maxHistory = Number.isInteger(config.maxHistory) ? config.maxHistory : 5;
    this.toolCaller = new ToolCaller(ollamaClient);
  }

  _buildSystemPrompt() {
    const now = new Date().toISOString();
    return `You are ${this.name}. Personality: ${this.personality} Current time: ${now}

Be concise. Ask for clarification if unclear.`;
  }

  _cleanResponse(text) {
    if (!text) return '';
    return text
      .replace(/<\|assistant\|>/g, '')
      .replace(/<\|user\|>/g, '')
      .replace(/<\|system\|>/g, '')
      .replace(/<s>/g, '')
      .replace(/<\/s>/g, '')
      .replace(/<tool>/g, '')
      .replace(/<\/tool>/g, '')
      .trim();
  }

  async processMessage(userMessage) {
    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: userMessage
    });

    // Keep conversation history manageable
    if (this.conversationHistory.length > this.maxHistory) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistory);
    }

    const messages = [
      { role: 'system', content: this.systemPrompt },
      ...this.conversationHistory
    ];

    try {
      if (this.tools.length > 0) {
        const assistantMessage = await this.toolCaller.run(messages, this.tools);
        if (!assistantMessage) {
          console.warn('⚠️ Empty assistant response after tool flow.');
        }
        this.conversationHistory.push({
          role: 'assistant',
          content: assistantMessage || "I'm here. Please try again."
        });
        return assistantMessage || "I'm here. Please try again.";
      }

      const response = await this.ollama.chat(messages);
      const assistantMessage = this._cleanResponse(response?.message?.content);
      if (!assistantMessage) {
        console.warn('⚠️ Empty assistant response after cleaning. Raw response:', JSON.stringify(response?.message || response));
      }
      this.conversationHistory.push({
        role: 'assistant',
        content: assistantMessage || "I'm here. Please try again."
      });

      return assistantMessage || "I'm here. Please try again.";

    } catch (error) {
      console.error('Error processing message:', error);
      throw error;
    }
  }

  clearHistory() {
    this.conversationHistory = [];
  }
}
