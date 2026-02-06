import { Ollama } from 'ollama';

export class OllamaClient {
  constructor(config) {
    if (!config.baseUrl) {
      throw new Error('baseUrl is required');
    }
    if (!config.model) {
      throw new Error('model is required');
    }
    this.baseUrl = config.baseUrl;
    this.model = config.model;
    this.client = new Ollama({ host: this.baseUrl });
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

  async testConnection() {
    try {
      const response = await this.client.list();
      const modelExists = response.models.some(m => m.name.includes(this.model));

      if (!modelExists) {
        console.warn(
          `⚠️  Model ${this.model} not found. Available models:`,
          response.models.map(m => m.name).join(', ')
        );
      }

      return true;
    } catch (error) {
      throw new Error(`Failed to connect to Ollama at ${this.baseUrl}: ${error.message}`);
    }
  }

  _mapTools(tools = []) {
    if (!Array.isArray(tools) || tools.length === 0) {
      return undefined;
    }

    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters || { type: 'object', properties: {} },
      },
    }));
  }

  async chat(messages, tools = null, _options = {}) {
    const safeMessages = Array.isArray(messages) ? messages.map(m => ({ ...m })) : [];
    const mappedTools = this._mapTools(tools);
    const options = {
      model: this.model,
      messages: safeMessages,
      stream: false,
    };

    if (mappedTools) {
      options.tools = mappedTools;
    }

    try {
      const response = await this.client.chat(options);
      return response;
    } catch (error) {
      throw new Error(`Ollama chat error: ${error.message}`);
    }
  }

  async generate(prompt, options = {}) {
    try {
      const response = await this.client.generate({
        model: this.model,
        prompt: prompt,
        stream: false,
        ...options,
      });
      return response.response;
    } catch (error) {
      throw new Error(`Ollama generate error: ${error.message}`);
    }
  }
}
