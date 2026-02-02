import { test, describe, mock, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ToolCaller } from './toolCaller.js';

describe('ToolCaller', () => {
  let mockOllama;
  let toolCaller;

  beforeEach(() => {
    // Create a mock Ollama client
    mockOllama = {
      chat: mock.fn(),
    };
    toolCaller = new ToolCaller(mockOllama);
  });

  describe('_buildToolList', () => {
    test('should extract name and description from tools', () => {
      const tools = [
        { name: 'tool1', description: 'First tool', execute: () => {} },
        { name: 'tool2', description: 'Second tool', execute: () => {} },
      ];

      const result = toolCaller._buildToolList(tools);

      assert.strictEqual(result.length, 2);
      assert.deepStrictEqual(result[0], { name: 'tool1', description: 'First tool' });
      assert.deepStrictEqual(result[1], { name: 'tool2', description: 'Second tool' });
    });

    test('should handle empty tools array', () => {
      const result = toolCaller._buildToolList([]);
      assert.deepStrictEqual(result, []);
    });
  });

  describe('_parseJsonObject', () => {
    test('should extract JSON from text', () => {
      const text = 'Some text before {"key": "value"} some text after';
      const result = toolCaller._parseJsonObject(text);
      assert.deepStrictEqual(result, { key: 'value' });
    });

    test('should handle JSON with nested objects', () => {
      const text = '{"outer": {"inner": "value"}}';
      const result = toolCaller._parseJsonObject(text);
      assert.deepStrictEqual(result, { outer: { inner: 'value' } });
    });

    test('should return null for invalid JSON', () => {
      const text = '{invalid json}';
      const result = toolCaller._parseJsonObject(text);
      assert.strictEqual(result, null);
    });

    test('should return null for text without JSON', () => {
      const text = 'Just plain text without any JSON';
      const result = toolCaller._parseJsonObject(text);
      assert.strictEqual(result, null);
    });

    test('should return null for empty string', () => {
      const result = toolCaller._parseJsonObject('');
      assert.strictEqual(result, null);
    });

    test('should return null for null input', () => {
      const result = toolCaller._parseJsonObject(null);
      assert.strictEqual(result, null);
    });
  });

  describe('_routeTools', () => {
    test('should identify tools needed', async () => {
      mockOllama.chat.mock.mockImplementation(async () => ({
        message: {
          content: '{"tool_calls": [{"name": "calculate"}]}',
        },
        prompt_eval_count: 100,
        eval_count: 20,
      }));

      const tools = [{ name: 'calculate', description: 'Do math' }];
      const messages = [{ role: 'user', content: 'What is 2+2?' }];

      const result = await toolCaller._routeTools(messages, tools);

      assert.strictEqual(result.tool_calls.length, 1);
      assert.strictEqual(result.tool_calls[0].name, 'calculate');
    });

    test('should return direct response when no tools needed', async () => {
      mockOllama.chat.mock.mockImplementation(async () => ({
        message: {
          content: 'I can answer that directly.',
        },
        prompt_eval_count: 50,
        eval_count: 10,
      }));

      const tools = [{ name: 'calculate', description: 'Do math' }];
      const messages = [{ role: 'user', content: 'Hello' }];

      const result = await toolCaller._routeTools(messages, tools);

      assert.strictEqual(result.tool_calls.length, 0);
      assert.ok(result.response.includes('directly'));
    });
  });

  describe('_requestToolArgs', () => {
    test('should extract arguments for selected tools', async () => {
      mockOllama.chat.mock.mockImplementation(async () => ({
        message: {
          content: '{"tool_calls": [{"name": "calculate", "arguments": {"expression": "2+2"}}]}',
        },
        prompt_eval_count: 150,
        eval_count: 30,
      }));

      const tools = [
        {
          name: 'calculate',
          description: 'Do math',
          parameters: {
            type: 'object',
            properties: { expression: { type: 'string' } },
          },
        },
      ];

      const messages = [{ role: 'user', content: 'Calculate 2+2' }];
      const selectedTools = ['calculate'];

      const result = await toolCaller._requestToolArgs(
        messages,
        selectedTools,
        tools,
        'Calculate 2+2'
      );

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, 'calculate');
      assert.deepStrictEqual(result[0].arguments, { expression: '2+2' });
    });

    test('should only include schemas for selected tools', async () => {
      mockOllama.chat.mock.mockImplementation(async () => ({
        message: { content: '{"tool_calls": []}' },
        prompt_eval_count: 100,
        eval_count: 10,
      }));

      const tools = [
        { name: 'tool1', description: 'First', parameters: {} },
        { name: 'tool2', description: 'Second', parameters: {} },
        { name: 'tool3', description: 'Third', parameters: {} },
      ];

      const selectedTools = ['tool2'];
      const messages = [{ role: 'user', content: 'test' }];

      await toolCaller._requestToolArgs(messages, selectedTools, tools, 'test');

      // Check that the system prompt only includes tool2
      const callArgs = mockOllama.chat.mock.calls[0].arguments[0];
      const systemPrompt = callArgs[0].content;

      assert.ok(systemPrompt.includes('tool2'));
      assert.ok(!systemPrompt.includes('tool1'));
      assert.ok(!systemPrompt.includes('tool3'));
    });
  });

  describe('run', () => {
    test('should execute full tool calling flow', async () => {
      let callCount = 0;

      // Mock all three stages
      mockOllama.chat.mock.mockImplementation(async () => {
        callCount++;

        if (callCount === 1) {
          // Stage 1: routing
          return {
            message: { content: '{"tool_calls": [{"name": "calculate"}]}' },
            prompt_eval_count: 100,
            eval_count: 10,
          };
        } else if (callCount === 2) {
          // Stage 2: argument extraction
          return {
            message: {
              content:
                '{"tool_calls": [{"name": "calculate", "arguments": {"expression": "2+2"}}]}',
            },
            prompt_eval_count: 150,
            eval_count: 20,
          };
        } else {
          // Stage 3: final response
          return {
            message: { content: 'The result is 4' },
            prompt_eval_count: 80,
            eval_count: 15,
          };
        }
      });

      const tools = [
        {
          name: 'calculate',
          description: 'Do math',
          parameters: {
            type: 'object',
            properties: { expression: { type: 'string' } },
          },
          execute: async () => ({ result: 4 }),
        },
      ];

      const messages = [{ role: 'user', content: 'What is 2+2?' }];

      const result = await toolCaller.run(messages, tools);

      assert.ok(result.includes('4'));
      assert.strictEqual(callCount, 3);
    });

    test('should return direct response when no tools selected', async () => {
      mockOllama.chat.mock.mockImplementation(async () => ({
        message: { content: 'Hello! How can I help?' },
        prompt_eval_count: 50,
        eval_count: 10,
      }));

      const tools = [];
      const messages = [{ role: 'user', content: 'Hello' }];

      const result = await toolCaller.run(messages, tools);

      assert.ok(result.includes('help'));
      assert.strictEqual(mockOllama.chat.mock.calls.length, 1);
    });
  });
});
