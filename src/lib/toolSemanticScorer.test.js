import { test, describe } from 'node:test';
import assert from 'node:assert';
import { ToolSemanticScorer } from './toolSemanticScorer.js';

describe('ToolSemanticScorer', () => {
  test('should cap tool selection at max tools and include core tools', () => {
    const scorer = new ToolSemanticScorer({ maxTools: 3 });
    const tools = [
      { name: 'remember', description: 'Remember facts', keywords: ['remember'], core: true },
      { name: 'weather', description: 'Get weather', keywords: ['weather', 'forecast'] },
      { name: 'calculate', description: 'Do math', keywords: ['calculate', 'math'] },
      { name: 'search', description: 'Search', keywords: ['search', 'lookup'] },
    ];

    const messages = [{ role: 'user', content: 'What is the weather in London?' }];
    const result = scorer.selectTools(messages, tools);

    assert.strictEqual(result.length, 3);
    assert.ok(result.some(tool => tool.name === 'remember'));
  });

  test('should return empty array when no tools provided', () => {
    const scorer = new ToolSemanticScorer({ maxTools: 3 });
    const messages = [{ role: 'user', content: 'Hello' }];
    const result = scorer.selectTools(messages, []);
    assert.deepStrictEqual(result, []);
  });

  test('should include all core tools even if they exceed maxTools', () => {
    const scorer = new ToolSemanticScorer({ maxTools: 1 });
    const tools = [
      { name: 'remember', description: 'Remember facts', core: true },
      { name: 'recall', description: 'Recall facts', core: true },
      { name: 'search', description: 'Search the web' },
    ];

    const messages = [{ role: 'user', content: 'Remind me what I said earlier' }];
    const result = scorer.selectTools(messages, tools);

    assert.strictEqual(result.length, 2);
    assert.ok(result.every(tool => tool.core));
  });

  test('should return core tools even when maxTools is zero', () => {
    const scorer = new ToolSemanticScorer({ maxTools: 0 });
    const tools = [
      { name: 'remember', description: 'Remember facts', core: true },
      { name: 'search', description: 'Search the web' },
    ];

    const messages = [{ role: 'user', content: 'Remember this fact' }];
    const result = scorer.selectTools(messages, tools);

    assert.deepStrictEqual(
      result.map(tool => tool.name),
      ['remember']
    );
  });
});
