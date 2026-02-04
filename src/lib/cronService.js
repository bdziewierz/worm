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

  _jobKey(userId, jobId) {
    return `${userId}::${jobId}`;
  }

  _nextJobId(userId) {
    const activeJobs = this._getJobsForUser(userId).filter(job => job.status === 'active');
    const used = new Set(activeJobs.map(job => job.id));
    for (let slot = 1; slot <= this.maxJobsPerUser; slot += 1) {
      const id = String(slot);
      if (!used.has(id)) {
        return id;
      }
    }
    return null;
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
    const jobsByUser = new Map();
    for (const job of persistedJobs) {
      if (job.status !== 'active') {
        continue;
      }
      if (!jobsByUser.has(job.userId)) {
        jobsByUser.set(job.userId, []);
      }
      jobsByUser.get(job.userId).push(job);
    }

    let restoredCount = 0;
    for (const [userId, jobs] of jobsByUser.entries()) {
      jobs.sort((a, b) => {
        const aTime = a.nextRunAt ? Date.parse(a.nextRunAt) : Date.parse(a.createdAt || 0);
        const bTime = b.nextRunAt ? Date.parse(b.nextRunAt) : Date.parse(b.createdAt || 0);
        return aTime - bTime;
      });
      let slot = 1;
      for (const job of jobs) {
        if (slot > this.maxJobsPerUser) {
          // Exceeded capacity; cancel the extra job to avoid undefined behavior
          job.status = 'cancelled';
          await this.store.deleteJob(job.id, job.userId);
          continue;
        }
        job.id = String(slot);
        slot += 1;
        await this.store.upsertJob(job);
        const key = this._jobKey(userId, job.id);
        this.jobs.set(key, job);
        this._armJob(job);
        restoredCount += 1;
      }
    }
    return restoredCount;
  }

  async scheduleJob({
    userId,
    roomId,
    command,
    intervalMinutes,
    startAt = null,
    maxRuns = null,
    type = 'reminder',
  }) {
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

    const jobId = this._nextJobId(userId);
    if (!jobId) {
      throw new Error('No job slots available. Cancel an existing job first.');
    }

    const job = {
      id: jobId,
      userId,
      roomId,
      command: command.trim(),
      type,
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
    const key = this._jobKey(userId, job.id);
    this.jobs.set(key, job);
    this._armJob(job);
    return this._formatJob(job);
  }

  async cancelJob(jobId, userId) {
    const key = this._jobKey(userId, jobId);
    const job = this.jobs.get(key);
    if (!job || job.userId !== userId) {
      return { success: false, message: 'Job not found.' };
    }
    if (job.status !== 'active') {
      return { success: false, message: 'Job is already inactive.' };
    }

    job.status = 'cancelled';
    job.nextRunAt = null;
    job.updatedAt = toIso(Date.now());
    this._clearTimer(key);
    await this.store.deleteJob(job.id, userId);
    this.jobs.delete(key);
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

  _clearTimer(timerKey) {
    const existing = this.timers.get(timerKey);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(timerKey);
    }
  }

  _armJob(job) {
    const timerKey = this._jobKey(job.userId, job.id);
    this._clearTimer(timerKey);
    if (job.status !== 'active') {
      return;
    }
    const nextTs = job.nextRunAt ? Date.parse(job.nextRunAt) : null;
    if (!nextTs) {
      return;
    }
    const delay = Math.max(nextTs - Date.now(), 0);
    const timerId = setTimeout(() => this._handleDueJob(timerKey), delay);
    this.timers.set(timerKey, timerId);
  }

  _handleDueJob(jobKey) {
    const job = this.jobs.get(jobKey);
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

    const nowIso = toIso(Date.now());
    job.lastRunAt = nowIso;
    job.runCount += 1;

    const reachedLimit = job.maxRuns !== null && job.runCount >= job.maxRuns;
    if (reachedLimit) {
      job.status = 'completed';
      job.nextRunAt = null;
      const key = this._jobKey(job.userId, job.id);
      this._clearTimer(key);
      await this.store.deleteJob(job.id, job.userId);
      this.jobs.delete(key);
    } else {
      const nextRunMs = Date.now() + this._intervalToMs(job.intervalMinutes);
      job.nextRunAt = toIso(nextRunMs);
      job.updatedAt = nowIso;
      await this.store.upsertJob(job);
      const key = this._jobKey(job.userId, job.id);
      this.jobs.set(key, job);
      this._armJob(job);
    }
  }

  async clearJobs(userId) {
    if (!userId) {
      throw new Error('userId is required');
    }
    const jobs = this._getJobsForUser(userId);
    for (const job of jobs) {
      const key = this._jobKey(job.userId, job.id);
      this._clearTimer(key);
      this.jobs.delete(key);
    }
    this.queue = this.queue.filter(job => job.userId !== userId);
    await this.store.deleteAllJobs(userId);
    return { removed: jobs.length };
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
