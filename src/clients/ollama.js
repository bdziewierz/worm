import { Ollama } from 'ollama';

export class OllamaClient {
  constructor(config) {
    this.baseUrl = config.baseUrl;
    this.model = config.model;
    this.client = new Ollama({ host: this.baseUrl });
  }

  async testConnection() {
    try {
      const response = await this.client.list();
      const modelExists = response.models.some(m => m.name.includes(this.model));

      if (!modelExists) {
        console.warn(`⚠️  Model ${this.model} not found. Available models:`,
          response.models.map(m => m.name).join(', '));
      }

      return true;
    } catch (error) {
      throw new Error(`Failed to connect to Ollama at ${this.baseUrl}: ${error.message}`);
    }
  }

  async chat(messages, tools = null) {
    const options = {
      model: this.model,
      messages: messages,
      stream: false
    };

    if (tools && tools.length > 0) {
      options.tools = tools;
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
        ...options
      });
      return response.response;
    } catch (error) {
      throw new Error(`Ollama generate error: ${error.message}`);
    }
  }
}
