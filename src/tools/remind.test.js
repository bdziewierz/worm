import { describe, test } from 'node:test';
import assert from 'node:assert';
import { remindTool } from './remind.js';

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
}

describe('remind tool (chat reminders)', () => {
  test('requires cron service to be available', async () => {
    const result = await remindTool.execute(
      { action: 'list' },
      { userId: '@user', roomId: '!room' }
    );
    assert.ok(result.error.includes('Cron service'));
  });

  test('schedules chat reminders with reminder delivery', async () => {
    const cron = new StubCronService();
    const context = { userId: '@user', roomId: '!room', services: { cron } };
    const result = await remindTool.execute(
      { action: 'schedule', command: 'stretch break', intervalMinutes: 30 },
      context
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.job.type, 'reminder');
    assert.strictEqual(result.job.delivery, 'chat');
  });

  test('lists reminders scoped to user', async () => {
    const cron = new StubCronService();
    const context = { userId: '@user', roomId: '!room', services: { cron } };
    await remindTool.execute(
      { action: 'schedule', command: 'hydrate', intervalMinutes: 60 },
      context
    );

    const list = await remindTool.execute({ action: 'list' }, context);
    assert.strictEqual(list.jobs.length, 1);
    assert.strictEqual(list.jobs[0].command, 'hydrate');
  });
});
