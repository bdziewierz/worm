import { OllamaClient } from '../clients/ollama.js';

const SUPPORTED_PROVIDERS = {
  ollama: {
    label: 'Ollama',
    createClient: config =>
      new OllamaClient({
        baseUrl: config?.baseUrl,
        model: config?.model,
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

  async chat(messages, tools = null) {
    if (typeof this.client?.chat !== 'function') {
      throw new Error(`Active LLM provider "${this.providerLabel}" does not support chat`);
    }
    return this.client.chat(messages, tools);
  }
}
