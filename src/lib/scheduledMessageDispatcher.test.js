import { describe, test, mock } from 'node:test';
import assert from 'node:assert';
import { ScheduledMessageDispatcher } from './scheduledMessageDispatcher.js';

describe('ScheduledMessageDispatcher', () => {
  test('dispatch sends agent response to Matrix room', async () => {
    const agent = {
      processMessage: mock.fn(async () => 'done'),
    };
    const matrixClient = {
      setTyping: mock.fn(async () => {}),
      sendMessage: mock.fn(async () => {}),
    };
    const dispatcher = new ScheduledMessageDispatcher({ agent, matrixClient });
    const job = { id: 'job-1', command: 'hello', userId: '@user', roomId: '!room' };

    await dispatcher.dispatch(job);

    assert.strictEqual(agent.processMessage.mock.calls.length, 1);
    assert.strictEqual(matrixClient.sendMessage.mock.calls[0].arguments[0], 'done');
    assert.strictEqual(matrixClient.sendMessage.mock.calls[0].arguments[1], '!room');
    assert.strictEqual(matrixClient.setTyping.mock.calls.at(-1).arguments[1], false);
  });

  test('dispatch reports failures to the room', async () => {
    const agent = {
      processMessage: mock.fn(async () => {
        throw new Error('oops');
      }),
    };
    const matrixClient = {
      setTyping: mock.fn(async () => {}),
      sendMessage: mock.fn(async () => {}),
    };
    const dispatcher = new ScheduledMessageDispatcher({ agent, matrixClient });
    const job = { id: 'job-2', command: 'hello', userId: '@user', roomId: '!room' };

    await assert.rejects(() => dispatcher.dispatch(job), /oops/);
    const failureMessage = matrixClient.sendMessage.mock.calls[0].arguments[0];
    assert.ok(failureMessage.includes('job-2'));
  });
});
