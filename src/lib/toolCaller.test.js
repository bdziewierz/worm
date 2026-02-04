import { test, describe, mock, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ToolCaller } from './toolCaller.js';

describe('ToolCaller', () => {
  let mockLLM;
  let toolCaller;

  beforeEach(() => {
    // Create a mock Ollama client
    mockLLM = {
      chat: mock.fn(),
    };
    toolCaller = new ToolCaller(mockLLM);
  });

  describe('run', () => {
    test('should execute tool call flow with selected tools', async () => {
      let callCount = 0;

      mockLLM.chat.mock.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            message: {
              content: '',
              tool_calls: [{ name: 'calculate', arguments: { expression: '2+2' } }],
            },
            prompt_eval_count: 100,
            eval_count: 10,
          };
        }
        return {
          message: { content: 'The result is 4' },
          prompt_eval_count: 80,
          eval_count: 15,
        };
      });

      const tools = [
        {
          name: 'calculate',
          description: 'Do math',
          keywords: ['calculate', 'math'],
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
      assert.strictEqual(callCount, 2);
    });

    test('should return direct response when no tool calls', async () => {
      mockLLM.chat.mock.mockImplementation(async () => ({
        message: { content: 'Hello! How can I help?' },
        prompt_eval_count: 50,
        eval_count: 10,
      }));

      const tools = [];
      const messages = [{ role: 'user', content: 'Hello' }];

      const result = await toolCaller.run(messages, tools);

      assert.ok(result.includes('help'));
      assert.strictEqual(mockLLM.chat.mock.calls.length, 1);
    });
  });
});
