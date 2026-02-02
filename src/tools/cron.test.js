import { describe, test } from 'node:test';
import assert from 'node:assert';
import { cronTool } from './cron.js';

class StubCronService {
  constructor() {
    this.scheduled = [];
    this.cancelled = [];
    this.jobs = [];
  }

  async scheduleJob(payload) {
    const job = {
      id: `job-${this.scheduled.length + 1}`,
      ...payload,
      lastRunAt: null,
      nextRunAt: new Date().toISOString(),
      status: 'active',
      remainingRuns: null,
    };
    this.scheduled.push(job);
    this.jobs.push(job);
    return job;
  }

  async listJobs(userId) {
    return this.jobs.filter(job => job.userId === userId);
  }

  async cancelJob(jobId) {
    const job = this.jobs.find(entry => entry.id === jobId);
    if (!job) {
      return { success: false, message: 'Job not found.' };
    }
    job.status = 'cancelled';
    this.cancelled.push(jobId);
    return { success: true, job };
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
    assert.ok(result.job.id.startsWith('job-'));
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

    const list = await cronTool.execute({ action: 'list' }, context);
    assert.strictEqual(list.jobs.length, 1);

    const cancel = await cronTool.execute({ action: 'cancel', jobId: scheduled.job.id }, context);
    assert.strictEqual(cancel.success, true);
  });
});
