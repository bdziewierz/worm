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
});
