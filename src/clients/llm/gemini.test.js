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

  test('maps tools into function declarations', async () => {
    let capturedBody = null;
    const fetchMock = mock.method(globalThis, 'fetch', async (...args) => {
      capturedBody = JSON.parse(args[1].body);
      return {
        ok: true,
        json: async () => ({ candidates: [], usageMetadata: {} }),
      };
    });

    try {
      const client = new GeminiClient({ apiKey: 'key', model: 'gemini-pro' });
      await client.chat(
        [
          { role: 'system', content: 'Return JSON' },
          { role: 'user', content: 'Hi' },
        ],
        [
          {
            name: 'get_weather',
            description: 'Weather tool',
            parameters: { type: 'object', properties: { location: { type: 'string' } } },
          },
        ],
        { responseFormat: 'json' }
      );

      assert.ok(capturedBody);
      assert.ok(Array.isArray(capturedBody.tools));
      assert.strictEqual(capturedBody.tools[0].functionDeclarations[0].name, 'get_weather');
      assert.deepStrictEqual(
        capturedBody.tools[0].functionDeclarations[0].parameters.properties.location.type,
        'string'
      );
    } finally {
      fetchMock.mock.restore();
    }
  });

  test('enforces JSON response when requested without tools', async () => {
    let capturedBody = null;
    const fetchMock = mock.method(globalThis, 'fetch', async (...args) => {
      capturedBody = JSON.parse(args[1].body);
      return {
        ok: true,
        json: async () => ({ candidates: [], usageMetadata: {} }),
      };
    });

    try {
      const client = new GeminiClient({ apiKey: 'key', model: 'gemini-pro' });
      await client.chat(
        [
          { role: 'system', content: 'Return JSON' },
          { role: 'user', content: 'Hi' },
        ],
        null,
        { responseFormat: 'json' }
      );

      assert.ok(capturedBody);
      assert.strictEqual(capturedBody.generationConfig.responseMimeType, 'application/json');
    } finally {
      fetchMock.mock.restore();
    }
  });

  test('does not force JSON mime when tools are present', async () => {
    let capturedBody = null;
    const fetchMock = mock.method(globalThis, 'fetch', async (...args) => {
      capturedBody = JSON.parse(args[1].body);
      return {
        ok: true,
        json: async () => ({ candidates: [], usageMetadata: {} }),
      };
    });

    try {
      const client = new GeminiClient({ apiKey: 'key', model: 'gemini-pro' });
      await client.chat(
        [{ role: 'user', content: 'hi' }],
        [
          {
            name: 'get_weather',
            description: 'Weather tool',
            parameters: { type: 'object', properties: { location: { type: 'string' } } },
          },
        ],
        { responseFormat: 'json' }
      );

      assert.ok(capturedBody);
      assert.ok(capturedBody.tools);
      assert.strictEqual(capturedBody.generationConfig?.responseMimeType, undefined);
    } finally {
      fetchMock.mock.restore();
    }
  });

  test('normalizes native function calls into tool_calls JSON', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: 'get_weather',
                    args: { location: 'Paris' },
                  },
                },
              ],
            },
          },
        ],
        usageMetadata: {},
      }),
    }));

    try {
      const client = new GeminiClient({ apiKey: 'key', model: 'gemini-pro' });
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
        { name: 'get_weather', arguments: { location: 'Paris' } },
      ]);
      assert.deepStrictEqual(JSON.parse(result.message.content), {
        tool_calls: [{ name: 'get_weather', arguments: { location: 'Paris' } }],
      });
    } finally {
      fetchMock.mock.restore();
    }
  });
});
