import { describe, test, mock } from 'node:test';
import assert from 'node:assert';
import { MistralClient } from './mistral.js';

describe('MistralClient', () => {
  test('requires apiKey and model', () => {
    assert.throws(() => new MistralClient({ model: 'mistral-medium' }), /apiKey is required/);
    assert.throws(() => new MistralClient({ apiKey: 'key' }), /model is required/);
  });

  test('chat returns assistant message', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: { content: 'Hello from Mistral' },
          },
        ],
        usage: {
          prompt_tokens: 60,
          completion_tokens: 15,
        },
      }),
    }));

    try {
      const client = new MistralClient({ apiKey: 'key', model: 'mistral-medium-latest' });
      const result = await client.chat([
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hi' },
      ]);

      assert.strictEqual(result.message.content, 'Hello from Mistral');
      assert.strictEqual(result.prompt_eval_count, 60);
      assert.strictEqual(result.eval_count, 15);
    } finally {
      fetchMock.mock.restore();
    }
  });

  test('chat surfaces API errors', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => ({
      ok: false,
      json: async () => ({ error: { message: 'mistral error' } }),
    }));

    try {
      const client = new MistralClient({ apiKey: 'key', model: 'mistral-medium-latest' });
      await assert.rejects(
        () => client.chat([{ role: 'user', content: 'hi' }]),
        /Mistral chat error/
      );
    } finally {
      fetchMock.mock.restore();
    }
  });

  test('normalizes native tool calls into tool_calls JSON', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '',
              tool_calls: [
                {
                  function: {
                    name: 'get_weather',
                    arguments: '{"location":"Berlin"}',
                  },
                },
              ],
            },
          },
        ],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
        },
      }),
    }));

    try {
      const client = new MistralClient({ apiKey: 'key', model: 'mistral-medium-latest' });
      const result = await client.chat(
        [{ role: 'user', content: 'weather' }],
        [
          {
            name: 'get_weather',
            description: 'Weather tool',
            parameters: { type: 'object', properties: { location: { type: 'string' } } },
          },
        ]
      );

      assert.ok(result.message.tool_calls);
      assert.deepStrictEqual(result.message.tool_calls, [
        { name: 'get_weather', arguments: { location: 'Berlin' } },
      ]);
      assert.deepStrictEqual(JSON.parse(result.message.content), {
        tool_calls: [{ name: 'get_weather', arguments: { location: 'Berlin' } }],
      });
    } finally {
      fetchMock.mock.restore();
    }
  });
});
