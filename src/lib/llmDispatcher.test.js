import { describe, test, mock } from 'node:test';
import assert from 'node:assert';
import { LLMDispatcher } from './llmDispatcher.js';

describe('LLMDispatcher', () => {
  test('delegates to injected client', async () => {
    const fakeClient = {
      testConnection: mock.fn(async () => true),
      chat: mock.fn(async () => ({ message: { content: 'hi' } })),
    };

    const dispatcher = new LLMDispatcher({ provider: 'custom', client: fakeClient });

    await dispatcher.testConnection();
    const result = await dispatcher.chat([], []);

    assert.strictEqual(fakeClient.testConnection.mock.calls.length, 1);
    assert.strictEqual(fakeClient.chat.mock.calls.length, 1);
    assert.deepStrictEqual(result, { message: { content: 'hi' } });
  });

  test('throws on unsupported provider without client', () => {
    assert.throws(() => new LLMDispatcher({ provider: 'unknown' }), /Unsupported LLM provider/);
  });
});
