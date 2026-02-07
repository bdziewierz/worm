import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { mkdtemp, stat } from 'node:fs/promises';
import path from 'path';
import os from 'os';
import { CronStore } from './cronStore.js';

function sampleJob(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: overrides.id || 'job-1',
    userId: overrides.userId || '@user:test',
    roomId: overrides.roomId || '!room:test',
    command: overrides.command || 'ping',
    intervalMinutes: overrides.intervalMinutes || 15,
    startAt: overrides.startAt || now,
    nextRunAt: overrides.nextRunAt || now,
    lastRunAt: overrides.lastRunAt || null,
    runCount: overrides.runCount || 0,
    maxRuns: overrides.maxRuns ?? null,
    status: overrides.status || 'active',
    createdAt: overrides.createdAt || now,
    updatedAt: overrides.updatedAt || now,
  };
}

describe('CronStore', () => {
  let baseDir;
  let store;

  beforeEach(async () => {
    baseDir = await mkdtemp(path.join(os.tmpdir(), 'cron-store-'));
    store = new CronStore({ baseDir });
  });

  test('upsertJob stores and listJobs retrieves per user entries', async () => {
    const job = sampleJob();
    await store.upsertJob(job);

    const jobs = await store.listJobs(job.userId);
    assert.strictEqual(jobs.length, 1);
    assert.strictEqual(jobs[0].id, job.id);

    await store.upsertJob({ ...job, command: 'updated' });
    const updated = await store.listJobs(job.userId);
    assert.strictEqual(updated.length, 1);
    assert.strictEqual(updated[0].command, 'updated');
  });

  test('getAllJobs aggregates across user files', async () => {
    await store.upsertJob(sampleJob({ id: 'job-a', userId: '@alice:test' }));
    await store.upsertJob(sampleJob({ id: 'job-b', userId: '@bob:test' }));

    const jobs = await store.getAllJobs();
    const ids = jobs.map(job => job.id).sort();
    assert.deepStrictEqual(ids, ['job-a', 'job-b']);
  });

  test('deleteAllJobs removes the persisted file', async () => {
    const userId = '@carol:test';
    await store.upsertJob(sampleJob({ userId }));
    const filePath = store._getUserFilePath(userId);

    await store.deleteAllJobs(userId);

    const exists = await stat(filePath)
      .then(() => true)
      .catch(() => false);

    assert.strictEqual(exists, false);
  });
});
