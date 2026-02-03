import { describe, test, mock } from 'node:test';
import assert from 'node:assert';
import { GeminiClient } from './gemini.js';

describe('GeminiClient', () => {
  test('requires apiKey and model', () => {
    assert.throws(() => new GeminiClient({ model: 'gemini' }), /apiKey is required/);
    assert.throws(() => new GeminiClient({ apiKey: 'key' }), /model is required/);
  });

  test('chat returns text content', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello' }],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 42,
          candidatesTokenCount: 7,
        },
      }),
    }));

    try {
      const client = new GeminiClient({ apiKey: 'key', model: 'gemini-pro' });
      const result = await client.chat([
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hi' },
      ]);

      assert.strictEqual(result.message.content, 'Hello');
      assert.strictEqual(result.prompt_eval_count, 42);
      assert.strictEqual(result.eval_count, 7);
    } finally {
      fetchMock.mock.restore();
    }
  });

  test('chat surfaces API errors', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => ({
      ok: false,
      json: async () => ({ error: { message: 'bad request' } }),
    }));

    try {
      const client = new GeminiClient({ apiKey: 'key', model: 'gemini-pro' });
      await assert.rejects(
        () => client.chat([{ role: 'user', content: 'hi' }]),
        /Gemini chat error/
      );
    } finally {
      fetchMock.mock.restore();
    }
  });
});
