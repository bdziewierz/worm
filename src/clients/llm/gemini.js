export class GeminiClient {
  constructor(config = {}) {
    if (!config.apiKey) {
      throw new Error('apiKey is required');
    }
    if (!config.model) {
      throw new Error('model is required');
    }

    this.apiKey = config.apiKey;
    this.model = config.model;
    this.apiBaseUrl = config.apiBaseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  }

  _buildPayload(messages = []) {
    const systemText = messages
      .filter(message => message.role === 'system')
      .map(message => message.content || '')
      .filter(Boolean)
      .join('\n');

    const contents = messages
      .filter(message => message.role !== 'system')
      .map(message => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content || '' }],
      }));

    const payload = { contents };
    if (systemText) {
      payload.systemInstruction = {
        parts: [{ text: systemText }],
      };
    }

    return payload;
  }

  async testConnection() {
    const url = `${this.apiBaseUrl}/models/${encodeURIComponent(this.model)}?key=${this.apiKey}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || response.statusText);
      }
      return true;
    } catch (error) {
      throw new Error(`Failed to connect to Gemini: ${error.message}`);
    }
  }

  async chat(messages, tools = null) {
    const url = `${this.apiBaseUrl}/models/${encodeURIComponent(this.model)}:generateContent?key=${this.apiKey}`;
    const payload = this._buildPayload(messages);

    // Gemini handles structured tool calling differently; we simply forward messages here.
    if (tools && tools.length > 0) {
      payload.tools = tools;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data?.error?.message || response.statusText;
        throw new Error(message);
      }

      const text = (data?.candidates?.[0]?.content?.parts || [])
        .map(part => part?.text || '')
        .filter(Boolean)
        .join('\n')
        .trim();

      return {
        message: { content: text },
        prompt_eval_count: data?.usageMetadata?.promptTokenCount || 0,
        eval_count: data?.usageMetadata?.candidatesTokenCount || 0,
      };
    } catch (error) {
      throw new Error(`Gemini chat error: ${error.message}`);
    }
  }
}
