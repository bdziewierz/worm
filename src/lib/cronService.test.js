import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { CronService } from './cronService.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

class InMemoryStore {
  constructor() {
    this.jobs = new Map();
  }

  _key(jobId, userId) {
    return `${userId}::${jobId}`;
  }

  async upsertJob(job) {
    this.jobs.set(this._key(job.id, job.userId), JSON.parse(JSON.stringify(job)));
    return job;
  }

  async getAllJobs() {
    return Array.from(this.jobs.values()).map(job => JSON.parse(JSON.stringify(job)));
  }

  async deleteJob(jobId, userId) {
    this.jobs.delete(this._key(jobId, userId));
  }

  async deleteAllJobs(userId) {
    for (const key of Array.from(this.jobs.keys())) {
      if (key.startsWith(`${userId}::`)) {
        this.jobs.delete(key);
      }
    }
  }
}

class RecordingDispatcher {
  constructor(behavior = {}) {
    this.behavior = behavior;
    this.calls = [];
  }

  async dispatch(job) {
    this.calls.push(job);
    if (this.behavior.throw) {
      throw new Error('dispatch failed');
    }
  }
}

describe('CronService', () => {
  let store;
  let dispatcher;
  let service;

  beforeEach(() => {
    store = new InMemoryStore();
    dispatcher = new RecordingDispatcher();
    service = new CronService({
      store,
      dispatcher,
      minIntervalMinutes: 0.001,
      maxJobsPerUser: 2,
      throttleMs: 0,
    });
  });

  afterEach(async () => {
    await service.shutdown();
  });

  test('scheduleJob registers and lists jobs with numeric ids', async () => {
    const job = await service.scheduleJob({
      userId: '@user:test',
      roomId: '!room:test',
      command: 'check weather',
      intervalMinutes: 0.001,
    });

    assert.strictEqual(job.id, '1');

    const jobs = await service.listJobs('@user:test');
    assert.strictEqual(jobs.length, 1);
    assert.strictEqual(jobs[0].id, '1');
  });

  test('enforces max active jobs per user', async () => {
    await service.scheduleJob({
      userId: '@user:test',
      roomId: '!r',
      command: 'a',
      intervalMinutes: 0.001,
    });
    await service.scheduleJob({
      userId: '@user:test',
      roomId: '!r',
      command: 'b',
      intervalMinutes: 0.001,
    });

    await assert.rejects(() =>
      service.scheduleJob({
        userId: '@user:test',
        roomId: '!r',
        command: 'c',
        intervalMinutes: 0.001,
      })
    );
  });

  test('cancelJob stops future executions and removes job', async () => {
    const job = await service.scheduleJob({
      userId: '@user:test',
      roomId: '!r',
      command: 'ping',
      intervalMinutes: 0.001,
    });
    const result = await service.cancelJob(job.id, '@user:test');
    assert.ok(result.success);

    await wait(80);
    assert.strictEqual(dispatcher.calls.length, 0);

    const jobs = await service.listJobs('@user:test');
    assert.strictEqual(jobs.length, 0);
  });

  test('executes jobs via dispatcher respecting throttle', async () => {
    await service.scheduleJob({
      userId: '@user:test',
      roomId: '!r',
      command: 'first',
      intervalMinutes: 0.001,
    });
    await wait(80);
    assert.ok(dispatcher.calls.length >= 1);
    assert.strictEqual(dispatcher.calls[0].command, 'first');
  });

  test('job numbers reuse freed slots per user', async () => {
    const first = await service.scheduleJob({
      userId: '@user:test',
      roomId: '!r',
      command: 'one',
      intervalMinutes: 0.001,
    });
    const second = await service.scheduleJob({
      userId: '@user:test',
      roomId: '!r',
      command: 'two',
      intervalMinutes: 0.001,
    });
    assert.deepStrictEqual([first.id, second.id], ['1', '2']);

    await service.cancelJob(first.id, '@user:test');
    const replacement = await service.scheduleJob({
      userId: '@user:test',
      roomId: '!r',
      command: 'three',
      intervalMinutes: 0.001,
    });
    assert.strictEqual(replacement.id, '1');
  });

  test('clearJobs removes every job for a user', async () => {
    await service.scheduleJob({
      userId: '@user:test',
      roomId: '!r',
      command: 'one',
      intervalMinutes: 0.001,
    });
    await service.scheduleJob({
      userId: '@user:test',
      roomId: '!r',
      command: 'two',
      intervalMinutes: 0.001,
    });

    const result = await service.clearJobs('@user:test');
    assert.strictEqual(result.removed, 2);

    const jobs = await service.listJobs('@user:test');
    assert.deepStrictEqual(jobs, []);
  });
});
