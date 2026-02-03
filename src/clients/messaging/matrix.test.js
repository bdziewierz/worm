import { test, describe } from 'node:test';
import assert from 'node:assert';
import { MatrixClient } from './matrix.js';

describe('MatrixClient', () => {
  describe('constructor validation', () => {
    test('should throw error if homeserver is missing', () => {
      assert.throws(
        () =>
          new MatrixClient({
            userId: '@bot:matrix.org',
            accessToken: 'token',
          }),
        /homeserver is required/
      );
    });

    test('should throw error if userId is missing', () => {
      assert.throws(
        () =>
          new MatrixClient({
            homeserver: 'https://matrix.org',
            accessToken: 'token',
          }),
        /userId is required/
      );
    });

    test('should throw error if accessToken is missing', () => {
      assert.throws(
        () =>
          new MatrixClient({
            homeserver: 'https://matrix.org',
            userId: '@bot:matrix.org',
          }),
        /accessToken is required/
      );
    });

    test('should create instance with valid config', () => {
      const client = new MatrixClient({
        homeserver: 'https://matrix.org',
        userId: '@bot:matrix.org',
        accessToken: 'token',
      });

      assert.ok(client);
      assert.strictEqual(client.userId, '@bot:matrix.org');
    });
  });

  describe('user allowlist', () => {
    test('should allow all users when allowlist is empty', () => {
      const client = new MatrixClient({
        homeserver: 'https://matrix.org',
        userId: '@bot:matrix.org',
        accessToken: 'token',
        roomId: '!room:matrix.org',
        allowedUsers: [],
      });

      assert.strictEqual(client.isUserAllowed('@anyone:matrix.org'), true);
      assert.strictEqual(client.isUserAllowed('@other:example.com'), true);
    });

    test('should allow all users when allowlist is undefined', () => {
      const client = new MatrixClient({
        homeserver: 'https://matrix.org',
        userId: '@bot:matrix.org',
        accessToken: 'token',
        roomId: '!room:matrix.org',
      });

      assert.strictEqual(client.isUserAllowed('@anyone:matrix.org'), true);
    });

    test('should only allow users in allowlist', () => {
      const client = new MatrixClient({
        homeserver: 'https://matrix.org',
        userId: '@bot:matrix.org',
        accessToken: 'token',
        roomId: '!room:matrix.org',
        allowedUsers: ['@alice:matrix.org', '@bob:example.com'],
      });

      assert.strictEqual(client.isUserAllowed('@alice:matrix.org'), true);
      assert.strictEqual(client.isUserAllowed('@bob:example.com'), true);
      assert.strictEqual(client.isUserAllowed('@charlie:matrix.org'), false);
      assert.strictEqual(client.isUserAllowed('@mallory:evil.com'), false);
    });

    test('should handle whitespace in allowlist', () => {
      const client = new MatrixClient({
        homeserver: 'https://matrix.org',
        userId: '@bot:matrix.org',
        accessToken: 'token',
        roomId: '!room:matrix.org',
        allowedUsers: ['  @alice:matrix.org  ', '@bob:example.com'],
      });

      assert.strictEqual(client.isUserAllowed('@alice:matrix.org'), true);
      assert.strictEqual(client.isUserAllowed('  @alice:matrix.org  '), true);
    });

    test('should always allow the bot itself', () => {
      const client = new MatrixClient({
        homeserver: 'https://matrix.org',
        userId: '@bot:matrix.org',
        accessToken: 'token',
        roomId: '!room:matrix.org',
        allowedUsers: ['@alice:matrix.org'],
      });

      // Bot should be allowed even if not in allowlist
      assert.strictEqual(client.isUserAllowed('@bot:matrix.org'), true);
    });
  });

  describe('message validation', () => {
    test('should reject messages from bot itself', () => {
      const client = new MatrixClient({
        homeserver: 'https://matrix.org',
        userId: '@bot:matrix.org',
        accessToken: 'token',
      });

      const event = {
        getSender: () => '@bot:matrix.org',
        getType: () => 'm.room.message',
        getRoomId: () => '!room:matrix.org',
        getContent: () => ({ msgtype: 'm.text', body: 'test' }),
      };

      assert.strictEqual(client.shouldProcessMessage(event), false);
    });

    test('should reject messages from disallowed room', () => {
      const client = new MatrixClient({
        homeserver: 'https://matrix.org',
        userId: '@bot:matrix.org',
        accessToken: 'token',
        allowedRooms: ['!allowed:matrix.org'],
      });

      const event = {
        getSender: () => '@alice:matrix.org',
        getType: () => 'm.room.message',
        getRoomId: () => '!different:matrix.org',
        getContent: () => ({ msgtype: 'm.text', body: 'test' }),
      };

      assert.strictEqual(client.shouldProcessMessage(event), false);
    });

    test('should reject non-text messages', () => {
      const client = new MatrixClient({
        homeserver: 'https://matrix.org',
        userId: '@bot:matrix.org',
        accessToken: 'token',
      });

      const event = {
        getSender: () => '@alice:matrix.org',
        getType: () => 'm.room.message',
        getRoomId: () => '!room:matrix.org',
        getContent: () => ({ msgtype: 'm.image', body: 'image.png' }),
      };

      assert.strictEqual(client.shouldProcessMessage(event), false);
    });

    test('should reject messages from unauthorized users', () => {
      const client = new MatrixClient({
        homeserver: 'https://matrix.org',
        userId: '@bot:matrix.org',
        accessToken: 'token',
        allowedUsers: ['@alice:matrix.org'],
      });

      const event = {
        getSender: () => '@mallory:evil.com',
        getType: () => 'm.room.message',
        getRoomId: () => '!room:matrix.org',
        getContent: () => ({ msgtype: 'm.text', body: 'test' }),
      };

      assert.strictEqual(client.shouldProcessMessage(event), false);
    });

    test('should accept valid messages from allowed users in allowed rooms', () => {
      const client = new MatrixClient({
        homeserver: 'https://matrix.org',
        userId: '@bot:matrix.org',
        accessToken: 'token',
        allowedUsers: ['@alice:matrix.org'],
        allowedRooms: ['!room:matrix.org'],
      });

      const event = {
        getSender: () => '@alice:matrix.org',
        getType: () => 'm.room.message',
        getRoomId: () => '!room:matrix.org',
        getContent: () => ({ msgtype: 'm.text', body: 'Hello bot!' }),
      };

      assert.strictEqual(client.shouldProcessMessage(event), true);
    });
  });
});
