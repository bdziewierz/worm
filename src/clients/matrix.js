import sdk from 'matrix-js-sdk';

export class MatrixClient {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.messageHandlers = [];
    this.allowedUsers = this._parseAllowedUsers(config.allowedUsers);
    this.allowedRooms = this._parseAllowedRooms(config.allowedRooms);
  }

  _parseAllowedUsers(allowedUsersStr) {
    if (!allowedUsersStr || allowedUsersStr.trim() === '') {
      return null; // null means allow all users
    }
    const users = allowedUsersStr.split(',').map(u => u.trim()).filter(u => u.length > 0);
    return users.length > 0 ? users : null; // Return null if empty after filtering
  }

  _parseAllowedRooms(allowedRoomsStr) {
    if (!allowedRoomsStr || allowedRoomsStr.trim() === '') {
      return null; // null means allow all rooms
    }
    const rooms = allowedRoomsStr.split(',').map(r => r.trim()).filter(r => r.length > 0);
    return rooms.length > 0 ? rooms : null; // Return null if empty after filtering
  }

  _isUserAllowed(userId) {
    // If no allowlist is configured, allow all users
    if (this.allowedUsers === null) {
      return true;
    }
    // Check if user is in the allowlist
    return this.allowedUsers.includes(userId);
  }

  _isRoomAllowed(roomId) {
    // If no allowlist is configured, allow all rooms
    if (this.allowedRooms === null) {
      return true;
    }
    // Check if room is in the allowlist
    return this.allowedRooms.includes(roomId);
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

      // Set presence to online
      try {
        await this.client.setPresence({ presence: 'online' });
      } catch (error) {
        console.warn('Could not set presence:', error.message);
      }

      // Set up message listener - try both event names for compatibility
      this.client.on('Room.timeline', (event, room) => {
        console.log('⚡ Room.timeline event fired');
        this._handleTimelineEvent(event, room);
      });

      this.client.on('event', (event) => {
        if (event.getType() === 'm.room.message') {
          console.log('⚡ Generic event fired for message');
        }
      });

      // Auto-accept room invitations
      this.client.on('RoomMember.membership', async (event, member) => {
        if (member.membership === 'invite' && member.userId === this.config.userId) {
          const roomId = member.roomId;
          
          // Check if room is in allowlist (if configured)
          if (!this._isRoomAllowed(roomId)) {
            console.log(`   Allowed rooms: ${this.allowedRooms ? this.allowedRooms.join(', ') : 'all'}`);
            console.log(`🚫 Declined invite to non-allowed room: ${roomId}`);
            await this.client.leave(roomId);
            return;
          }
          
          try {
            await this.client.joinRoom(roomId);
            console.log(`✓ Joined room: ${roomId}`);
          } catch (error) {
            console.error(`Failed to join room ${roomId}:`, error.message);
          }
        }
      });

      return true;
    } catch (error) {
      throw new Error(`Failed to connect to Matrix: ${error.message}`);
    }
  }

  _handleTimelineEvent(event, room) {
    const eventType = event.getType();
    const sender = event.getSender();
    const roomId = room.roomId;
    
    console.log(`🔍 Event: type=${eventType}, sender=${sender}, room=${roomId}`);

    // Only process text messages
    if (eventType !== 'm.room.message') {
      console.log(`   ↳ Skipped: Not a message event`);
      return;
    }
    
    const content = event.getContent();
    console.log(`   ↳ msgtype=${content.msgtype}, body="${content.body}"`);
    
    if (content.msgtype !== 'm.text') {
      console.log(`   ↳ Skipped: Not a text message`);
      return;
    }

    // Ignore our own messages
    if (sender === this.config.userId) {
      console.log(`   ↳ Skipped: Own message`);
      return;
    }

    console.log(`\n📨 Message from ${sender} in ${roomId}`);

    // Check if room is allowed
    if (!this._isRoomAllowed(roomId)) {
      console.log(`🚫 Ignored: Room not in allowlist`);
      return; // Silently ignore messages from non-allowed rooms
    }

    // Check if user is allowed
    if (!this._isUserAllowed(sender)) {
      console.log(`🚫 Rejected message from unauthorized user: ${sender}`);
      return;
    }

    // Ignore old messages (only process new messages)
    const age = Date.now() - event.getTs();
    if (age > 5000) {
      console.log(`⏭️  Ignored: Message too old (${Math.round(age/1000)}s)`);
      return; // Ignore messages older than 5 seconds
    }

    const message = {
      text: content.body,
      sender: event.getSender(),
      timestamp: event.getTs(),
      eventId: event.getId(),
      roomId: room.roomId
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

  async sendMessage(text, roomId) {
    try {
      await this.client.sendTextMessage(roomId, text);
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
