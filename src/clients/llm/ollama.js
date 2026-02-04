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

  _buildPromptToolSystemPrompt(tools = []) {
    const toolSchemas = tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters || { type: 'object', properties: {} },
    }));

    return (
      `You may use tools to answer the user. ` +
      `If a tool is needed, respond ONLY with JSON: ` +
      `{"tool_calls":[{"name":"tool_name","arguments":{...}}]}. ` +
      `If no tool is needed, respond normally. ` +
      `Tools: ${JSON.stringify(toolSchemas)}`
    );
  }

  async chat(messages, tools = null, _options = {}) {
    const promptTooling = Array.isArray(tools) && tools.length > 0;
    const toolPrompt = promptTooling
      ? [{ role: 'system', content: this._buildPromptToolSystemPrompt(tools) }]
      : [];
    const options = {
      model: this.model,
      messages: [...toolPrompt, ...messages],
      stream: false,
    };

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
