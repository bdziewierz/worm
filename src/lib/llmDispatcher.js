import { OllamaClient } from '../clients/llm/ollama.js';
import { GeminiClient } from '../clients/llm/gemini.js';
import { MistralClient } from '../clients/llm/mistral.js';

const SUPPORTED_PROVIDERS = {
  ollama: {
    label: 'Ollama',
    createClient: config =>
      new OllamaClient({
        baseUrl: config?.baseUrl,
        model: config?.model,
      }),
  },
  gemini: {
    label: 'Google Gemini',
    createClient: config =>
      new GeminiClient({
        apiKey: config?.apiKey,
        model: config?.model,
        apiBaseUrl: config?.apiBaseUrl,
      }),
  },
  mistral: {
    label: 'Mistral',
    createClient: config =>
      new MistralClient({
        apiKey: config?.apiKey,
        model: config?.model,
        apiBaseUrl: config?.apiBaseUrl,
      }),
  },
};

export class LLMDispatcher {
  constructor({ provider = 'ollama', config = {}, client = null } = {}) {
    this.providerName = provider.toLowerCase();

    if (client) {
      this.client = client;
      this.providerLabel = provider;
      return;
    }

    const providerDefinition = SUPPORTED_PROVIDERS[this.providerName];
    if (!providerDefinition) {
      throw new Error(`Unsupported LLM provider: ${provider}`);
    }

    this.providerLabel = providerDefinition.label;
    this.client = providerDefinition.createClient(config);
  }

  async testConnection() {
    if (typeof this.client?.testConnection === 'function') {
      return this.client.testConnection();
    }
    return true;
  }

  async chat(messages, tools = null, options = {}) {
    if (typeof this.client?.chat !== 'function') {
      throw new Error(`Active LLM provider "${this.providerLabel}" does not support chat`);
    }
    return this.client.chat(messages, tools, options);
  }

  async requestToolArgs(messages, selectedTools, userMessage) {
    if (typeof this.client?.requestToolArgs !== 'function') {
      throw new Error(
        `Active LLM provider "${this.providerLabel}" does not support tool argument extraction`
      );
    }
    return this.client.requestToolArgs(messages, selectedTools, userMessage);
  }
}
