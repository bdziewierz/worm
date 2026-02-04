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

  async chat(messages, tools = null, _options = {}) {
    const options = {
      model: this.model,
      messages: messages,
      stream: false,
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
        ...options,
      });
      return response.response;
    } catch (error) {
      throw new Error(`Ollama generate error: ${error.message}`);
    }
  }

  async requestToolArgs(messages, selectedTools, userMessage) {
    const schemas = (selectedTools || []).map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters || {},
    }));

    const systemPrompt =
      `Tools with parameters: ${JSON.stringify(schemas)}\n\n` +
      `Task: Extract arguments for each tool from the conversation.\n` +
      `Output: {"tool_calls": [{"name": "tool_name", "arguments": {...}}]}`;

    const response = await this.chat(
      [
        { role: 'system', content: systemPrompt },
        ...messages,
        { role: 'user', content: userMessage },
      ],
      selectedTools,
      { responseFormat: 'json' }
    );

    const rawToolCalls = response?.message?.tool_calls;
    const normalizedToolCalls = Array.isArray(rawToolCalls)
      ? rawToolCalls
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
          .filter(Boolean)
      : [];

    const parsed = this._parseJsonObject(response?.message?.content);
    const parsedToolCalls = parsed && Array.isArray(parsed.tool_calls) ? parsed.tool_calls : [];
    const tool_calls = normalizedToolCalls.length > 0 ? normalizedToolCalls : parsedToolCalls;
    if (tool_calls.length === 0) {
      const content = response?.message?.content || '';
      console.log(`⚠️  Ollama tool args empty. Raw content: ${content.substring(0, 500)}`);
    }
    return {
      tool_calls,
      prompt_eval_count: response?.prompt_eval_count || 0,
      eval_count: response?.eval_count || 0,
    };
  }
}
