import { describe, test } from 'node:test';
import assert from 'node:assert';
import { cronTool } from './cron.js';

class StubCronService {
  constructor(maxJobsPerUser = 5) {
    this.maxJobsPerUser = maxJobsPerUser;
    this.jobs = [];
  }

  async scheduleJob(payload) {
    const active = this.jobs.filter(
      job => job.userId === payload.userId && job.status === 'active'
    );
    const used = new Set(active.map(job => job.id));
    let id = null;
    for (let slot = 1; slot <= this.maxJobsPerUser; slot += 1) {
      const candidate = String(slot);
      if (!used.has(candidate)) {
        id = candidate;
        break;
      }
    }
    if (!id) {
      throw new Error('No job slots available');
    }

    const job = {
      id,
      ...payload,
      lastRunAt: null,
      nextRunAt: new Date().toISOString(),
      status: 'active',
      remainingRuns: null,
    };
    this.jobs.push(job);
    return job;
  }

  async listJobs(userId) {
    return this.jobs.filter(job => job.userId === userId && job.status === 'active');
  }

  async cancelJob(jobId, userId) {
    const job = this.jobs.find(
      entry => entry.userId === userId && entry.id === jobId && entry.status === 'active'
    );
    if (!job) {
      return { success: false, message: 'Job not found.' };
    }
    job.status = 'cancelled';
    return { success: true, job };
  }

  async clearJobs(userId) {
    const before = this.jobs.length;
    this.jobs = this.jobs.filter(job => job.userId !== userId);
    return { removed: before - this.jobs.length };
  }
}

describe('cron tool', () => {
  test('requires cron service to be available', async () => {
    const result = await cronTool.execute({ action: 'list' }, { userId: '@user', roomId: '!room' });
    assert.ok(result.error.includes('Cron service'));
  });

  test('schedules a job with valid inputs', async () => {
    const cron = new StubCronService();
    const context = { userId: '@user', roomId: '!room', services: { cron } };
    const result = await cronTool.execute(
      { action: 'schedule', command: 'check price', intervalMinutes: 15 },
      context
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.job.id, '1');
    assert.ok(result.info.includes('#1'));
  });

  test('validates interval and startAt parameters', async () => {
    const cron = new StubCronService();
    const context = { userId: '@user', roomId: '!room', services: { cron } };
    const invalidInterval = await cronTool.execute(
      { action: 'schedule', command: 'ping', intervalMinutes: 1 },
      context
    );
    assert.ok(invalidInterval.error.includes('intervalMinutes'));

    const invalidStart = await cronTool.execute(
      { action: 'schedule', command: 'ping', intervalMinutes: 10, startAt: 'not-a-date' },
      context
    );
    assert.ok(invalidStart.error.includes('startAt'));
  });

  test('lists and cancels jobs', async () => {
    const cron = new StubCronService();
    const context = { userId: '@user', roomId: '!room', services: { cron } };
    const scheduled = await cronTool.execute(
      { action: 'schedule', command: 'status', intervalMinutes: 15 },
      context
    );

    const listBefore = await cronTool.execute({ action: 'list' }, context);
    assert.strictEqual(listBefore.jobs.length, 1);

    const cancel = await cronTool.execute({ action: 'cancel', jobId: scheduled.job.id }, context);
    assert.strictEqual(cancel.success, true);

    const listAfter = await cronTool.execute({ action: 'list' }, context);
    assert.strictEqual(listAfter.jobs.length, 0);
  });

  test('clears all jobs', async () => {
    const cron = new StubCronService();
    const context = { userId: '@user', roomId: '!room', services: { cron } };
    await cronTool.execute({ action: 'schedule', command: 'a', intervalMinutes: 15 }, context);
    await cronTool.execute({ action: 'schedule', command: 'b', intervalMinutes: 15 }, context);

    const clear = await cronTool.execute({ action: 'clear' }, context);
    assert.strictEqual(clear.success, true);
    assert.strictEqual(clear.removed, 2);
    const list = await cronTool.execute({ action: 'list' }, context);
    assert.strictEqual(list.jobs.length, 0);
  });
});
