import { randomUUID } from 'crypto';

const DEFAULT_MIN_INTERVAL_MINUTES = 5;
const DEFAULT_MAX_JOBS_PER_USER = 5;
const DEFAULT_THROTTLE_MS = 1000;

function toIso(value) {
  return new Date(value).toISOString();
}

function sleep(ms) {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class CronService {
  constructor(options = {}) {
    const { store, dispatcher } = options;
    if (!store) {
      throw new Error('CronService requires a store instance');
    }
    if (!dispatcher) {
      throw new Error('CronService requires a dispatcher instance');
    }
    this.store = store;
    this.dispatcher = dispatcher;
    this.minIntervalMinutes = options.minIntervalMinutes || DEFAULT_MIN_INTERVAL_MINUTES;
    this.maxJobsPerUser = options.maxJobsPerUser || DEFAULT_MAX_JOBS_PER_USER;
    this.throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS;
    this.jobs = new Map();
    this.timers = new Map();
    this.queue = [];
    this.processingQueue = false;
  }

  _intervalToMs(minutes) {
    return minutes * 60 * 1000;
  }

  _parseDate(value) {
    const ts = Date.parse(value);
    return Number.isNaN(ts) ? null : ts;
  }

  _getJobsForUser(userId) {
    return Array.from(this.jobs.values()).filter(job => job.userId === userId);
  }

  _formatJob(job) {
    const remainingRuns =
      job.maxRuns === null || job.maxRuns === undefined
        ? null
        : Math.max(job.maxRuns - job.runCount, 0);
    return {
      id: job.id,
      command: job.command,
      intervalMinutes: job.intervalMinutes,
      nextRunAt: job.nextRunAt,
      lastRunAt: job.lastRunAt,
      maxRuns: job.maxRuns,
      remainingRuns,
      status: job.status,
      roomId: job.roomId,
    };
  }

  async restore() {
    const persistedJobs = await this.store.getAllJobs();
    for (const job of persistedJobs) {
      this.jobs.set(job.id, job);
      if (job.status === 'active') {
        this._armJob(job);
      }
    }
    return persistedJobs.length;
  }

  async scheduleJob({ userId, roomId, command, intervalMinutes, startAt = null, maxRuns = null }) {
    if (!userId) {
      throw new Error('userId is required');
    }
    if (!roomId) {
      throw new Error('roomId is required');
    }
    if (!command || typeof command !== 'string') {
      throw new Error('command is required');
    }
    if (!Number.isFinite(intervalMinutes)) {
      throw new Error('intervalMinutes must be a number');
    }
    if (intervalMinutes < this.minIntervalMinutes) {
      throw new Error(`Interval must be at least ${this.minIntervalMinutes} minutes.`);
    }

    const activeJobs = this._getJobsForUser(userId).filter(job => job.status === 'active');
    if (activeJobs.length >= this.maxJobsPerUser) {
      throw new Error(`Limit reached: max ${this.maxJobsPerUser} active cron jobs per user.`);
    }

    const intervalMs = this._intervalToMs(intervalMinutes);
    const now = Date.now();
    let startMs = startAt ? this._parseDate(startAt) : now + intervalMs;
    if (startMs === null) {
      throw new Error('Invalid startAt value. Use ISO 8601 timestamps.');
    }

    if (startMs < now) {
      // Align next run to the next interval boundary in the future
      const behind = now - startMs;
      const skippedIntervals = Math.floor(behind / intervalMs) + 1;
      startMs += skippedIntervals * intervalMs;
    }

    const nextRunIso = toIso(startMs);
    const createdAt = toIso(now);
    const normalizedMaxRuns = Number.isInteger(maxRuns) && maxRuns > 0 ? maxRuns : null;

    const job = {
      id: randomUUID(),
      userId,
      roomId,
      command: command.trim(),
      intervalMinutes,
      startAt: toIso(startMs),
      nextRunAt: nextRunIso,
      lastRunAt: null,
      runCount: 0,
      maxRuns: normalizedMaxRuns,
      status: 'active',
      createdAt,
      updatedAt: createdAt,
    };

    await this.store.upsertJob(job);
    this.jobs.set(job.id, job);
    this._armJob(job);
    return this._formatJob(job);
  }

  async cancelJob(jobId, userId) {
    const job = this.jobs.get(jobId);
    if (!job || job.userId !== userId) {
      return { success: false, message: 'Job not found.' };
    }
    if (job.status !== 'active') {
      return { success: false, message: 'Job is already inactive.' };
    }

    job.status = 'cancelled';
    job.nextRunAt = null;
    job.updatedAt = toIso(Date.now());
    this._clearTimer(job.id);
    await this.store.upsertJob(job);
    return { success: true, job: this._formatJob(job) };
  }

  async listJobs(userId) {
    const jobs = this._getJobsForUser(userId);
    const sorted = jobs.sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;
      const aTime = a.nextRunAt ? Date.parse(a.nextRunAt) : Infinity;
      const bTime = b.nextRunAt ? Date.parse(b.nextRunAt) : Infinity;
      return aTime - bTime;
    });
    return sorted.map(job => this._formatJob(job));
  }

  _clearTimer(jobId) {
    const existing = this.timers.get(jobId);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(jobId);
    }
  }

  _armJob(job) {
    this._clearTimer(job.id);
    if (job.status !== 'active') {
      return;
    }
    const nextTs = job.nextRunAt ? Date.parse(job.nextRunAt) : null;
    if (!nextTs) {
      return;
    }
    const delay = Math.max(nextTs - Date.now(), 0);
    const timerId = setTimeout(() => this._handleDueJob(job.id), delay);
    this.timers.set(job.id, timerId);
  }

  _handleDueJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'active') {
      return;
    }
    this.queue.push(job);
    this._processQueue();
  }

  async _processQueue() {
    if (this.processingQueue) {
      return;
    }
    this.processingQueue = true;
    while (this.queue.length > 0) {
      const job = this.queue.shift();
      await this._executeJob(job);
      if (this.queue.length > 0) {
        await sleep(this.throttleMs);
      }
    }
    this.processingQueue = false;
  }

  async _executeJob(job) {
    if (job.status !== 'active') {
      return;
    }
    try {
      await this.dispatcher.dispatch(job);
    } catch (error) {
      console.error(`Cron job ${job.id} failed: ${error.message}`);
    }

    job.lastRunAt = toIso(Date.now());
    job.runCount += 1;

    const reachedLimit = job.maxRuns !== null && job.runCount >= job.maxRuns;
    if (reachedLimit) {
      job.status = 'completed';
      job.nextRunAt = null;
      this._clearTimer(job.id);
    } else {
      const nextRunMs = Date.now() + this._intervalToMs(job.intervalMinutes);
      job.nextRunAt = toIso(nextRunMs);
      this._armJob(job);
    }

    job.updatedAt = toIso(Date.now());
    await this.store.upsertJob(job);
    this.jobs.set(job.id, job);
  }

  async shutdown() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.queue = [];
    this.processingQueue = false;
  }
}
