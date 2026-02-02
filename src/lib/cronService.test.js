import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { CronService } from './cronService.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

class InMemoryStore {
  constructor() {
    this.jobs = new Map();
  }

  async upsertJob(job) {
    this.jobs.set(job.id, JSON.parse(JSON.stringify(job)));
    return job;
  }

  async getAllJobs() {
    return Array.from(this.jobs.values()).map(job => JSON.parse(JSON.stringify(job)));
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

  test('scheduleJob registers and lists jobs', async () => {
    const job = await service.scheduleJob({
      userId: '@user:test',
      roomId: '!room:test',
      command: 'check weather',
      intervalMinutes: 0.001,
    });

    assert.ok(job.id);

    const jobs = await service.listJobs('@user:test');
    assert.strictEqual(jobs.length, 1);
    assert.strictEqual(jobs[0].id, job.id);
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

    await assert.rejects(
      () =>
        service.scheduleJob({
          userId: '@user:test',
          roomId: '!r',
          command: 'c',
          intervalMinutes: 0.001,
        }),
      /Limit reached/
    );
  });

  test('cancelJob stops future executions', async () => {
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
    assert.strictEqual(jobs[0].status, 'cancelled');
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
});
