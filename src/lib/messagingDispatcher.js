import { MatrixClient } from '../clients/matrix.js';

const SUPPORTED_CHANNELS = {
  matrix: {
    label: 'Matrix',
    createClient: config =>
      new MatrixClient({
        homeserver: config?.homeserver,
        userId: config?.userId,
        accessToken: config?.accessToken,
        allowedUsers: config?.allowedUsers,
        allowedRooms: config?.allowedRooms,
      }),
  },
};

export class MessagingDispatcher {
  constructor({ provider = 'matrix', config = {}, client = null } = {}) {
    this.providerName = provider.toLowerCase();

    if (client) {
      this.client = client;
      this.providerLabel = provider;
      return;
    }

    const providerDefinition = SUPPORTED_CHANNELS[this.providerName];
    if (!providerDefinition) {
      throw new Error(`Unsupported messaging provider: ${provider}`);
    }

    this.providerLabel = providerDefinition.label;
    this.client = providerDefinition.createClient(config);
  }

  async connect() {
    if (typeof this.client?.connect !== 'function') {
      throw new Error(
        `Active messaging provider "${this.providerLabel}" does not support connect()`
      );
    }
    return this.client.connect();
  }

  async disconnect() {
    if (typeof this.client?.disconnect === 'function') {
      await this.client.disconnect();
    }
  }

  onMessage(handler) {
    if (typeof this.client?.onMessage !== 'function') {
      throw new Error(
        `Active messaging provider "${this.providerLabel}" does not support onMessage()`
      );
    }
    this.client.onMessage(handler);
  }

  async sendMessage(message, target) {
    if (typeof this.client?.sendMessage !== 'function') {
      throw new Error(
        `Active messaging provider "${this.providerLabel}" does not support sendMessage()`
      );
    }
    return this.client.sendMessage(message, target);
  }

  async setTyping(target, isTyping = true, timeoutMs = 30000) {
    if (typeof this.client?.setTyping === 'function') {
      await this.client.setTyping(target, isTyping, timeoutMs);
    }
  }
}
