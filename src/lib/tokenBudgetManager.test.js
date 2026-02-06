import { describe, test } from 'node:test';
import assert from 'node:assert';
import { TokenBudgetManager } from './tokenBudgetManager.js';

describe('TokenBudgetManager', () => {
  test('estimateTokensForMessage uses 4 chars per token heuristic', () => {
    const manager = new TokenBudgetManager();
    const tokens = manager.estimateTokensForMessage({ content: 'abcdefgh' });
    assert.strictEqual(tokens, 2);
  });

  test('enforceMessageBudget trims oldest middle messages first and leaves originals untouched', () => {
    const manager = new TokenBudgetManager({
      maxContextTokens: 10,
      responseBufferTokens: 0,
    });

    const messages = [
      { role: 'system', content: 's'.repeat(4) },
      { role: 'assistant', content: 'a'.repeat(40) },
      { role: 'user', content: 'u'.repeat(4) },
    ];

    const bounded = manager.enforceMessageBudget(messages);

    assert.deepStrictEqual(
      bounded.map(message => message.role),
      ['system', 'user']
    );
    assert.strictEqual(messages.length, 3);
  });

  test('enforceMessageBudget falls back to the most recent message when no budget available', () => {
    const manager = new TokenBudgetManager({
      maxContextTokens: 0,
      responseBufferTokens: 0,
    });

    const messages = [
      { role: 'system', content: 'setup' },
      { role: 'user', content: 'question' },
    ];

    const bounded = manager.enforceMessageBudget(messages);

    assert.strictEqual(bounded.length, 1);
    assert.strictEqual(bounded[0], messages[messages.length - 1]);
  });

  test('limitTools respects token budget and stops before exceeding it', () => {
    const manager = new TokenBudgetManager({ maxToolContextTokens: 6 });

    const tools = [
      { name: 'a', description: 'aaaa', parameters: {} },
      { name: 'bb', description: 'bbbb', parameters: {} },
      { name: 'ccc', description: 'cccc', parameters: {} },
    ];

    const limited = manager.limitTools(tools);

    assert.strictEqual(limited.length, 2);
    assert.deepStrictEqual(
      limited.map(tool => tool.name),
      ['a', 'bb']
    );
  });

  test('limitTools still returns the first tool when it alone exceeds the budget', () => {
    const manager = new TokenBudgetManager({ maxToolContextTokens: 1 });

    const largeTool = {
      name: 'expensive-tool',
      description: 'x'.repeat(200),
      parameters: { type: 'object', properties: { input: { type: 'string' } } },
    };

    const limited = manager.limitTools([largeTool, { name: 'cheap' }]);

    assert.strictEqual(limited.length, 1);
    assert.strictEqual(limited[0], largeTool);
  });
});
