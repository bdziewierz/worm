import { test, describe } from 'node:test';
import assert from 'node:assert';
import { responseSanitiser } from './responseSanitiser.js';

describe('responseSanitiser', () => {
  test('should return empty string for empty input', () => {
    assert.strictEqual(responseSanitiser(''), '');
    assert.strictEqual(responseSanitiser(null), '');
    assert.strictEqual(responseSanitiser(undefined), '');
  });

  test('should remove template tokens', () => {
    const input = '<|start_header|>some text<|end_header|>';
    const result = responseSanitiser(input);
    assert.strictEqual(result, 'some text');
  });

  test('should remove thinking tags', () => {
    const input = '<thinking>internal thoughts</thinking>actual response';
    const result = responseSanitiser(input);
    assert.strictEqual(result, 'actual response');
  });

  test('should remove reasoning tags', () => {
    const input = '<reasoning>my reasoning</reasoning>final answer';
    const result = responseSanitiser(input);
    assert.strictEqual(result, 'final answer');
  });

  test('should unwrap code blocks', () => {
    const input = '```json\n{"key": "value"}\n```';
    const result = responseSanitiser(input);
    assert.strictEqual(result, '{"key": "value"}');
  });

  test('should remove role prefixes', () => {
    const input = 'Assistant: Here is my response';
    const result = responseSanitiser(input);
    assert.strictEqual(result, 'Here is my response');
  });

  test('should remove instruction markers', () => {
    const input = '[INST] some instruction [/INST]actual content';
    const result = responseSanitiser(input);
    assert.strictEqual(result, 'actual content');
  });

  test('should handle multiple cleaning operations', () => {
    const input = '<thinking>thoughts</thinking>```\nAssistant: code\n```<|end|>';
    const result = responseSanitiser(input);
    assert.strictEqual(result, 'code');
  });

  test('should preserve normal text', () => {
    const input = 'This is a normal response without any artifacts.';
    const result = responseSanitiser(input);
    assert.strictEqual(result, input);
  });

  test('should normalize excessive newlines', () => {
    const input = 'Line 1\n\n\n\n\nLine 2';
    const result = responseSanitiser(input);
    assert.strictEqual(result, 'Line 1\n\nLine 2');
  });

  test('should trim whitespace', () => {
    const input = '  \n\n  response  \n\n  ';
    const result = responseSanitiser(input);
    assert.strictEqual(result, 'response');
  });
});
