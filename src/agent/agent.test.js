import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { HistoryStore } from '../lib/historyStore.js';
import { Agent } from './agent.js';

class FakeLLM {
  constructor(reply = 'ack') {
    this.reply = reply;
    this.calls = [];
  }

  async chat(messages) {
    this.calls.push(messages);
    return {
      message: { content: this.reply },
    };
  }
}

class InMemoryHistoryStore {
  constructor() {
    this.histories = new Map();
  }

  async getHistory(key) {
    const history = this.histories.get(key) || [];
    return history.map(entry => ({ ...entry }));
  }

  async setHistory(key, messages) {
    this.histories.set(
      key,
      messages.map(entry => ({ ...entry }))
    );
  }

  async clearHistory(key) {
    this.histories.delete(key);
  }

  async clearAll() {
    this.histories.clear();
  }
}

const tmpRoot = path.join(os.tmpdir(), 'worm-agent-test-');

const makeTempDir = async () => {
  await fs.mkdir(tmpRoot, { recursive: true });
  return await fs.mkdtemp(path.join(tmpRoot, '/history-'));
};

describe('Agent conversation history', () => {
  test('maintains separate histories per user', async () => {
    const llm = new FakeLLM('assistant-response');
    const historyStore = new InMemoryHistoryStore();
    const agent = new Agent(llm, [], { historyStore, maxHistory: 10 });

    await agent.processMessage('hi user1', { userId: '@user1:example' });
    await agent.processMessage('hi user2', { userId: '@user2:example' });

    const historyUser1 = await historyStore.getHistory('user:@user1:example');
    const historyUser2 = await historyStore.getHistory('user:@user2:example');

    assert.strictEqual(historyUser1.length, 2);
    assert.strictEqual(historyUser2.length, 2);
    assert.strictEqual(historyUser1[0].content, 'hi user1');
    assert.strictEqual(historyUser2[0].content, 'hi user2');
  });

  describe('persistence across agent instances', () => {
    let tempDir;

    beforeEach(async () => {
      tempDir = await makeTempDir();
    });

    afterEach(async () => {
      if (tempDir) {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });

    test('reloads stored history and includes it in prompts', async () => {
      const store = new HistoryStore({ baseDir: tempDir });
      const firstLlm = new FakeLLM('first-response');
      const agentA = new Agent(firstLlm, [], { historyStore: store });
      await agentA.processMessage('First turn', { userId: '@alice:matrix' });

      const secondStore = new HistoryStore({ baseDir: tempDir });
      const secondLlm = new FakeLLM('second-response');
      const agentB = new Agent(secondLlm, [], { historyStore: secondStore });
      await agentB.processMessage('Second turn', { userId: '@alice:matrix' });

      const [messages] = secondLlm.calls;
      const nonSystemMessages = messages.filter(message => message.role !== 'system');
      assert.deepStrictEqual(
        nonSystemMessages.map(m => m.content),
        ['First turn', 'first-response', 'Second turn']
      );
    });
  });
});
