import sdk from 'matrix-js-sdk';

export class MatrixClient {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.messageHandlers = [];
    this.allowedUsers = this._parseAllowedUsers(config.allowedUsers);
  }

  _parseAllowedUsers(allowedUsersStr) {
    if (!allowedUsersStr || allowedUsersStr.trim() === '') {
      return null; // null means allow all users
    }
    return allowedUsersStr.split(',').map(u => u.trim()).filter(u => u.length > 0);
  }

  _isUserAllowed(userId) {
    // If no allowlist is configured, allow all users
    if (this.allowedUsers === null) {
      return true;
    }
    // Check if user is in the allowlist
    return this.allowedUsers.includes(userId);
  }

  async connect() {
    try {
      this.client = sdk.createClient({
        baseUrl: this.config.homeserver,
        accessToken: this.config.accessToken,
        userId: this.config.userId
      });

      // Start the client
      await this.client.startClient({ initialSyncLimit: 10 });

      // Wait for sync
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Sync timeout')), 30000);
        
        this.client.once('sync', (state) => {
          clearTimeout(timeout);
          if (state === 'PREPARED') {
            resolve();
          } else {
            reject(new Error(`Unexpected sync state: ${state}`));
          }
        });
      });

      // Set up message listener
      this.client.on('Room.timeline', (event, room) => {
        this._handleTimelineEvent(event, room);
      });

      return true;
    } catch (error) {
      throw new Error(`Failed to connect to Matrix: ${error.message}`);
    }
  }

  _handleTimelineEvent(event, room) {
    // Only process messages from the configured room
    if (room.roomId !== this.config.roomId) return;

    // Only process text messages
    if (event.getType() !== 'm.room.message') return;
    
    const content = event.getContent();
    if (content.msgtype !== 'm.text') return;

    // Ignore our own messages
    if (event.getSender() === this.config.userId) return;

    // Check if user is allowed
    const sender = event.getSender();
    if (!this._isUserAllowed(sender)) {
      console.log(`🚫 Rejected message from unauthorized user: ${sender}`);
      return;
    }

    // Ignore old messages (only process new messages)
    const age = Date.now() - event.getTs();
    if (age > 5000) return; // Ignore messages older than 5 seconds

    const message = {
      text: content.body,
      sender: event.getSender(),
      timestamp: event.getTs(),
      eventId: event.getId()
    };

    // Call all registered handlers
    this.messageHandlers.forEach(handler => {
      try {
        handler(message);
      } catch (error) {
        console.error('Error in message handler:', error);
      }
    });
  }

  onMessage(handler) {
    this.messageHandlers.push(handler);
  }

  async sendMessage(text) {
    try {
      await this.client.sendTextMessage(this.config.roomId, text);
    } catch (error) {
      throw new Error(`Failed to send message: ${error.message}`);
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.stopClient();
    }
  }
}
