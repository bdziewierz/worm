import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { Memory } from './memory.js';

function uniqueUserId() {
  return `@test-${process.pid}-${Date.now()}-${Math.random()}`;
}

describe('Memory', () => {
  let memory;
  let userId;

  beforeEach(() => {
    memory = new Memory(3);
    userId = uniqueUserId();
  });

  afterEach(async () => {
    await memory.clearUserFacts(userId);
  });

  test('returns empty array for unknown users', async () => {
    const facts = await memory.getUserFacts(userId);
    assert.deepStrictEqual(facts, []);
  });

  test('addFact stores facts and enforces maxFacts FIFO eviction', async () => {
    await memory.addFact(userId, 'first');
    await memory.addFact(userId, 'second');
    await memory.addFact(userId, 'third');
    let facts = await memory.getUserFacts(userId);
    assert.deepStrictEqual(facts, ['first', 'second', 'third']);

    await memory.addFact(userId, 'fourth');
    facts = await memory.getUserFacts(userId);
    assert.deepStrictEqual(facts, ['second', 'third', 'fourth']);
  });

  test('clearUserFacts removes persisted data', async () => {
    await memory.addFact(userId, 'remember this');
    let facts = await memory.getUserFacts(userId);
    assert.strictEqual(facts.length, 1);

    await memory.clearUserFacts(userId);
    facts = await memory.getUserFacts(userId);
    assert.deepStrictEqual(facts, []);
  });
});
