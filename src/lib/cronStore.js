import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_DIR = path.join(__dirname, '../../memory/cron');

export class CronStore {
  constructor(options = {}) {
    this.baseDir = options.baseDir || DEFAULT_DIR;
  }

  async _ensureDir() {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  _hashUserId(userId) {
    return crypto.createHash('sha256').update(userId).digest('hex').substring(0, 16);
  }

  _getUserFilePath(userId) {
    const hash = this._hashUserId(userId);
    return path.join(this.baseDir, `${hash}.json`);
  }

  async _readJson(filePath) {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  }

  async _writeJson(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async _loadUserData(userId) {
    await this._ensureDir();
    const filePath = this._getUserFilePath(userId);
    try {
      return await this._readJson(filePath);
    } catch {
      const now = new Date().toISOString();
      return {
        userId,
        jobs: [],
        createdAt: now,
        updatedAt: now,
      };
    }
  }

  async _saveUserData(userId, data) {
    const filePath = this._getUserFilePath(userId);
    data.updatedAt = new Date().toISOString();
    await this._writeJson(filePath, data);
  }

  async upsertJob(job) {
    if (!job?.userId || !job?.id) {
      throw new Error('Job must include userId and id');
    }
    const data = await this._loadUserData(job.userId);
    const idx = data.jobs.findIndex(existing => existing.id === job.id);
    if (idx === -1) {
      data.jobs.push(job);
    } else {
      data.jobs[idx] = job;
    }
    await this._saveUserData(job.userId, data);
    return job;
  }

  async deleteJob(jobId, userId) {
    if (!jobId || !userId) {
      return false;
    }
    const data = await this._loadUserData(userId);
    const filtered = data.jobs.filter(job => job.id !== jobId);
    if (filtered.length === data.jobs.length) {
      return false;
    }
    data.jobs = filtered;
    await this._saveUserData(userId, data);
    return true;
  }

  async deleteAllJobs(userId) {
    if (!userId) {
      return;
    }
    const filePath = this._getUserFilePath(userId);
    try {
      await fs.unlink(filePath);
    } catch {
      // File might not exist, ignore
    }
  }

  async listJobs(userId) {
    if (!userId) {
      return [];
    }
    const data = await this._loadUserData(userId);
    return Array.isArray(data.jobs) ? data.jobs : [];
  }

  async getAllJobs() {
    await this._ensureDir();
    const jobs = [];
    const entries = await fs.readdir(this.baseDir).catch(() => []);
    for (const entry of entries) {
      if (!entry.endsWith('.json')) {
        continue;
      }
      const filePath = path.join(this.baseDir, entry);
      try {
        const data = await this._readJson(filePath);
        if (Array.isArray(data.jobs)) {
          jobs.push(...data.jobs);
        }
      } catch {
        // Ignore malformed files but continue loading others
      }
    }
    return jobs;
  }
}
