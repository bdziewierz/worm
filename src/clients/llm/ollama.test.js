import { test, describe, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { OllamaClient } from './ollama.js';

describe('OllamaClient', () => {
  test('should create instance with config', () => {
    const client = new OllamaClient({
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2',
    });

    assert.ok(client);
    assert.strictEqual(client.model, 'llama3.2');
    assert.strictEqual(client.baseUrl, 'http://localhost:11434');
  });

  test('should throw error if baseUrl is missing', () => {
    assert.throws(() => new OllamaClient({ model: 'llama3.2' }), /baseUrl is required/);
  });

  test('should throw error if model is missing', () => {
    assert.throws(
      () => new OllamaClient({ baseUrl: 'http://localhost:11434' }),
      /model is required/
    );
  });

  describe('chat method', () => {
    let client;
    let originalChat;

    beforeEach(() => {
      client = new OllamaClient({
        baseUrl: 'http://localhost:11434',
        model: 'test-model',
      });
    });

    afterEach(() => {
      if (originalChat) {
        client.client.chat = originalChat;
      }
    });

    test('should format messages correctly', async () => {
      // Mock the Ollama client's chat method
      client.client.chat = mock.fn(async ({ model, messages, stream }) => {
        assert.strictEqual(model, 'test-model');
        assert.strictEqual(stream, false);
        assert.strictEqual(messages.length, 2);
        assert.strictEqual(messages[0].role, 'system');
        assert.strictEqual(messages[1].role, 'user');

        return {
          message: { role: 'assistant', content: 'test response' },
          prompt_eval_count: 100,
          eval_count: 50,
        };
      });

      const messages = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
      ];

      const result = await client.chat(messages);

      assert.strictEqual(result.message.content, 'test response');
      assert.strictEqual(result.prompt_eval_count, 100);
      assert.strictEqual(result.eval_count, 50);
      assert.strictEqual(client.client.chat.mock.calls.length, 1);
    });

    test('should handle API errors', async () => {
      client.client.chat = mock.fn(async () => {
        throw new Error('Connection refused');
      });

      const messages = [{ role: 'user', content: 'test' }];

      await assert.rejects(async () => await client.chat(messages), /Ollama chat error/);
    });

    test('should return response with token counts', async () => {
      client.client.chat = mock.fn(async () => ({
        message: { role: 'assistant', content: 'Hello!' },
        prompt_eval_count: 150,
        eval_count: 75,
      }));

      const result = await client.chat([{ role: 'user', content: 'Hi' }]);

      assert.strictEqual(result.message.content, 'Hello!');
      assert.strictEqual(result.prompt_eval_count, 150);
      assert.strictEqual(result.eval_count, 75);
    });

    test('should pass mapped tools to Ollama when provided', async () => {
      const tools = [
        {
          name: 'search',
          description: 'Search the public web via Brave',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
          },
        },
      ];

      const expectedTools = [
        {
          type: 'function',
          function: {
            name: 'search',
            description: 'Search the public web via Brave',
            parameters: tools[0].parameters,
          },
        },
      ];

      const originalMessages = [{ role: 'user', content: 'Need gout info' }];

      client.client.chat = mock.fn(async options => {
        assert.deepStrictEqual(options.tools, expectedTools);
        assert.strictEqual(options.messages.length, 1);
        assert.strictEqual(options.messages[0].content, 'Need gout info');

        return {
          message: { role: 'assistant', content: 'ok' },
          prompt_eval_count: 1,
          eval_count: 1,
        };
      });

      await client.chat(originalMessages, tools);

      assert.strictEqual(originalMessages[0].content, 'Need gout info');
    });

    test('should omit tools option when none are provided', async () => {
      client.client.chat = mock.fn(async options => {
        assert.ok(!Object.prototype.hasOwnProperty.call(options, 'tools'));
        return {
          message: { role: 'assistant', content: 'ok' },
          prompt_eval_count: 1,
          eval_count: 1,
        };
      });

      await client.chat([{ role: 'user', content: 'Ping' }]);
    });
  });
});
