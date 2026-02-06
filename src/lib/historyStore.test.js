import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { HistoryStore } from './historyStore.js';

const tmpRoot = path.join(os.tmpdir(), 'worm-history-store-');

const makeTempDir = async () => {
  await fs.mkdir(tmpRoot, { recursive: true });
  return await fs.mkdtemp(path.join(tmpRoot, '/test-'));
};

describe('HistoryStore', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await makeTempDir();
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('persists history between instances', async () => {
    const firstStore = new HistoryStore({ baseDir: tempDir });
    await firstStore.appendMessage('user:abc', { role: 'user', content: 'hello' });

    const secondStore = new HistoryStore({ baseDir: tempDir });
    const history = await secondStore.getHistory('user:abc');

    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].role, 'user');
    assert.strictEqual(history[0].content, 'hello');
    assert.ok(history[0].timestamp);
  });

  test('appendMessage enforces max entries when provided', async () => {
    const store = new HistoryStore({ baseDir: tempDir });

    await store.appendMessage('user:max', { role: 'user', content: 'one' }, { maxEntries: 2 });
    await store.appendMessage('user:max', { role: 'assistant', content: 'two' }, { maxEntries: 2 });
    await store.appendMessage('user:max', { role: 'user', content: 'three' }, { maxEntries: 2 });

    const history = await store.getHistory('user:max');
    assert.strictEqual(history.length, 2);
    assert.deepStrictEqual(
      history.map(entry => entry.content),
      ['two', 'three']
    );
  });

  test('clearHistory removes persisted file and data', async () => {
    const store = new HistoryStore({ baseDir: tempDir });
    await store.appendMessage('user:clear', { role: 'user', content: 'hey' });

    await store.clearHistory('user:clear');
    const history = await store.getHistory('user:clear');

    assert.strictEqual(history.length, 0);
  });

  test('clearAll removes every stored history file', async () => {
    const store = new HistoryStore({ baseDir: tempDir });
    await store.appendMessage('user:a', { role: 'user', content: 'a' });
    await store.appendMessage('user:b', { role: 'user', content: 'b' });

    await store.clearAll();

    const newStore = new HistoryStore({ baseDir: tempDir });
    const historyA = await newStore.getHistory('user:a');
    const historyB = await newStore.getHistory('user:b');

    assert.strictEqual(historyA.length, 0);
    assert.strictEqual(historyB.length, 0);
  });
});
