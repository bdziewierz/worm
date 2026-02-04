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

  _mapTools(tools = null) {
    if (!Array.isArray(tools) || tools.length === 0) {
      return undefined;
    }

    return [
      {
        functionDeclarations: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters || { type: 'object', properties: {} },
        })),
      },
    ];
  }

  _extractResponseParts(data) {
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const textParts = [];
    const toolCalls = [];

    for (const part of parts) {
      if (part?.text) {
        textParts.push(part.text);
      } else if (part?.functionCall) {
        const name = part.functionCall.name || '';
        if (!name) {
          continue;
        }
        const args =
          part.functionCall.args && typeof part.functionCall.args === 'object'
            ? part.functionCall.args
            : {};
        toolCalls.push({ name, arguments: args });
      }
    }

    return {
      text: textParts.join('\n').trim(),
      tool_calls: toolCalls,
    };
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

  async chat(messages, tools = null, options = {}) {
    const url = `${this.apiBaseUrl}/models/${encodeURIComponent(this.model)}:generateContent?key=${this.apiKey}`;
    const payload = this._buildPayload(messages);

    const mappedTools = this._mapTools(tools);
    const hasTools = Boolean(mappedTools);
    if (mappedTools) {
      payload.tools = mappedTools;
    }

    if (options?.responseFormat === 'json' && !hasTools) {
      payload.generationConfig = {
        ...(payload.generationConfig || {}),
        responseMimeType: 'application/json',
      };
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

      const { text, tool_calls } = this._extractResponseParts(data);
      let content = text;
      if (tool_calls.length > 0) {
        content = JSON.stringify({ tool_calls });
      }

      return {
        message: {
          content,
          tool_calls: tool_calls.length > 0 ? tool_calls : undefined,
        },
        prompt_eval_count: data?.usageMetadata?.promptTokenCount || 0,
        eval_count: data?.usageMetadata?.candidatesTokenCount || 0,
      };
    } catch (error) {
      throw new Error(`Gemini chat error: ${error.message}`);
    }
  }
}
