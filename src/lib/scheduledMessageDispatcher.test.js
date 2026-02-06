import { describe, test, mock } from 'node:test';
import assert from 'node:assert';
import { ScheduledMessageDispatcher } from './scheduledMessageDispatcher.js';

describe('ScheduledMessageDispatcher', () => {
  test('dispatch sends agent response to messaging channel', async () => {
    const agent = {
      processMessage: mock.fn(async () => 'done'),
    };
    const messagingClient = {
      setTyping: mock.fn(async () => {}),
      sendMessage: mock.fn(async () => {}),
    };
    const dispatcher = new ScheduledMessageDispatcher({ agent, messagingClient });
    const job = { id: 'job-1', command: 'hello', userId: '@user', roomId: '!room' };

    await dispatcher.dispatch(job);

    assert.strictEqual(agent.processMessage.mock.calls.length, 1);
    assert.strictEqual(messagingClient.sendMessage.mock.calls[0].arguments[0], 'done');
    assert.strictEqual(messagingClient.sendMessage.mock.calls[0].arguments[1], '!room');
    assert.strictEqual(messagingClient.setTyping.mock.calls.at(-1).arguments[1], false);
  });

  test('dispatch reports failures to the room', async () => {
    const agent = {
      processMessage: mock.fn(async () => {
        throw new Error('oops');
      }),
    };
    const messagingClient = {
      setTyping: mock.fn(async () => {}),
      sendMessage: mock.fn(async () => {}),
    };
    const dispatcher = new ScheduledMessageDispatcher({ agent, messagingClient });
    const job = { id: 'job-2', command: 'hello', userId: '@user', roomId: '!room' };

    await assert.rejects(() => dispatcher.dispatch(job), /oops/);
    const failureMessage = messagingClient.sendMessage.mock.calls[0].arguments[0];
    assert.ok(failureMessage.includes('job-2'));
  });

  test('headless jobs skip messaging and log results', async () => {
    const agent = {
      processMessage: mock.fn(async () => 'ok'),
    };
    const messagingClient = {
      setTyping: mock.fn(async () => {}),
      sendMessage: mock.fn(async () => {}),
    };
    const logger = mock.fn(async () => {});
    const dispatcher = new ScheduledMessageDispatcher({
      agent,
      messagingClient,
      headlessLogger: logger,
    });

    const job = {
      id: 'job-headless',
      command: 'run automation',
      userId: '@user',
      roomId: '!room',
      delivery: 'headless',
      type: 'command',
    };

    await dispatcher.dispatch(job);

    assert.strictEqual(messagingClient.sendMessage.mock.calls.length, 0);
    assert.strictEqual(agent.processMessage.mock.calls.length, 1);
    const metadata = agent.processMessage.mock.calls[0].arguments[1];
    assert.strictEqual(metadata.persistHistory, false);
    assert.strictEqual(logger.mock.calls.length, 1);
    assert.strictEqual(logger.mock.calls[0].arguments[0].jobId, 'job-headless');
    assert.strictEqual(logger.mock.calls[0].arguments[0].response, 'ok');
  });
});
