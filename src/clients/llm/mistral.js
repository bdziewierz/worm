export class MistralClient {
  constructor(config = {}) {
    if (!config.apiKey) {
      throw new Error('apiKey is required');
    }
    if (!config.model) {
      throw new Error('model is required');
    }

    this.apiKey = config.apiKey;
    this.model = config.model;
    this.apiBaseUrl = config.apiBaseUrl || 'https://api.mistral.ai/v1';
  }

  _mapMessages(messages = []) {
    return messages.map(message => ({
      role: message.role || 'user',
      content: message.content || '',
    }));
  }

  _normalizeToolCalls(toolCalls = []) {
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
      return [];
    }

    return toolCalls
      .map(call => {
        const name = call?.function?.name || call?.name;
        if (!name) {
          return null;
        }

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

  async testConnection() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || response.statusText);
      }

      const payload = await response.json().catch(() => ({}));
      if (!Array.isArray(payload?.data)) {
        return true;
      }

      const modelExists = payload.data.some(entry => entry.id === this.model);
      if (!modelExists) {
        console.warn(
          `⚠️  Model ${this.model} not found. Available models: ${payload.data
            .map(entry => entry.id)
            .join(', ')}`
        );
      }

      return true;
    } catch (error) {
      throw new Error(`Failed to connect to Mistral: ${error.message}`);
    }
  }

  async chat(messages, tools = null, _options = {}) {
    const body = {
      model: this.model,
      messages: this._mapMessages(messages),
      stream: false,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data?.error?.message || response.statusText;
        throw new Error(message);
      }

      const message = data?.choices?.[0]?.message || {};
      const tool_calls = this._normalizeToolCalls(message?.tool_calls);
      let text = message?.content?.trim() || '';
      if (!text && tool_calls.length > 0) {
        text = JSON.stringify({ tool_calls });
      }
      return {
        message: {
          content: text,
          tool_calls: tool_calls.length > 0 ? tool_calls : undefined,
        },
        prompt_eval_count: data?.usage?.prompt_tokens || 0,
        eval_count: data?.usage?.completion_tokens || 0,
      };
    } catch (error) {
      throw new Error(`Mistral chat error: ${error.message}`);
    }
  }
}
