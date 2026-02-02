import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MEMORY_DIR = path.join(__dirname, '../../memory');
const MAX_FACTS = 10;

export class Memory {
  constructor(maxFacts = MAX_FACTS) {
    this.maxFacts = maxFacts;
  }

  async _ensureMemoryDir() {
    try {
      await fs.mkdir(MEMORY_DIR, { recursive: true });
    } catch {
      // Directory might already exist
    }
  }

  _getUserFilePath(userId) {
    // Sanitize userId for filename (hash it to avoid filesystem issues with special chars)
    const hash = crypto.createHash('sha256').update(userId).digest('hex').substring(0, 16);
    return path.join(MEMORY_DIR, `${hash}.json`);
  }

  async _loadUserData(userId) {
    const filePath = this._getUserFilePath(userId);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      // File doesn't exist yet, return empty structure
      return {
        userId: userId,
        facts: [],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };
    }
  }

  async _saveUserData(userId, data) {
    await this._ensureMemoryDir();
    const filePath = this._getUserFilePath(userId);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async getUserFacts(userId) {
    const userData = await this._loadUserData(userId);
    return userData.facts || [];
  }

  async addFact(userId, fact) {
    const userData = await this._loadUserData(userId);

    // Add new fact
    userData.facts.push(fact);
    userData.updated = new Date().toISOString();

    // Keep only last N facts (FIFO eviction)
    if (userData.facts.length > this.maxFacts) {
      userData.facts = userData.facts.slice(-this.maxFacts);
    }

    await this._saveUserData(userId, userData);
    return userData.facts.length;
  }

  async clearUserFacts(userId) {
    const filePath = this._getUserFilePath(userId);
    try {
      await fs.unlink(filePath);
    } catch {
      // File might not exist, ignore
    }
  }
}
