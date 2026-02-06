import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { logCronRun } from './cronRunLogger.js';

const tmpRoot = path.join(os.tmpdir(), 'worm-cron-log-');

const makeTempDir = async () => {
  await fs.mkdir(tmpRoot, { recursive: true });
  return await fs.mkdtemp(path.join(tmpRoot, '/log-'));
};

describe('logCronRun', () => {
  let logPath;

  beforeEach(async () => {
    const dir = await makeTempDir();
    logPath = path.join(dir, 'cron.log');
    process.env.__CRON_LOG_OVERRIDE__ = logPath;
  });

  afterEach(async () => {
    if (logPath) {
      const dir = path.dirname(logPath);
      await fs.rm(dir, { recursive: true, force: true });
    }
    delete process.env.__CRON_LOG_OVERRIDE__;
  });

  test('appends entries with timestamps', async () => {
    await logCronRun({ jobId: '1', command: 'ping' });
    await logCronRun({ jobId: '2', response: 'ok' });

    const contents = await fs.readFile(logPath, 'utf-8');
    const lines = contents.trim().split('\n');
    assert.strictEqual(lines.length, 2);
    const first = JSON.parse(lines[0]);
    const second = JSON.parse(lines[1]);
    assert.strictEqual(first.jobId, '1');
    assert.ok(first.timestamp);
    assert.strictEqual(second.response, 'ok');
  });
});
