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

  async chat(messages, tools = null) {
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

      const text = data?.choices?.[0]?.message?.content || '';
      return {
        message: { content: text },
        prompt_eval_count: data?.usage?.prompt_tokens || 0,
        eval_count: data?.usage?.completion_tokens || 0,
      };
    } catch (error) {
      throw new Error(`Mistral chat error: ${error.message}`);
    }
  }
}
