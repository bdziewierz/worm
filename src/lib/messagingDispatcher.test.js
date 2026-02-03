import { describe, test, mock } from 'node:test';
import assert from 'node:assert';
import { MessagingDispatcher } from './messagingDispatcher.js';

describe('MessagingDispatcher', () => {
  test('delegates to injected client', async () => {
    const fakeClient = {
      connect: mock.fn(async () => true),
      disconnect: mock.fn(async () => {}),
      sendMessage: mock.fn(async () => {}),
      setTyping: mock.fn(async () => {}),
      onMessage: mock.fn(handler => handler({ text: 'hi' })),
    };

    const dispatcher = new MessagingDispatcher({ provider: 'custom', client: fakeClient });

    await dispatcher.connect();
    dispatcher.onMessage(() => {});
    await dispatcher.sendMessage('hello', '!room');
    await dispatcher.setTyping('!room', true, 1000);
    await dispatcher.disconnect();

    assert.strictEqual(fakeClient.connect.mock.calls.length, 1);
    assert.strictEqual(fakeClient.onMessage.mock.calls.length, 1);
    assert.strictEqual(fakeClient.sendMessage.mock.calls.length, 1);
    assert.strictEqual(fakeClient.setTyping.mock.calls.length, 1);
    assert.strictEqual(fakeClient.disconnect.mock.calls.length, 1);
  });

  test('throws on unsupported provider without client', () => {
    assert.throws(
      () => new MessagingDispatcher({ provider: 'unknown' }),
      /Unsupported messaging provider/
    );
  });
});
