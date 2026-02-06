import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HISTORY_DIR = path.join(__dirname, '../../memory/history');

const cloneMessages = entries => entries.map(entry => ({ ...entry }));

export class HistoryStore {
  constructor(options = {}) {
    this.baseDir = options.baseDir || HISTORY_DIR;
  }

  async _ensureDir() {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
    } catch {
      // Directory already exists or cannot be created; ignore and let writes fail naturally
    }
  }

  _getUserFilePath(userKey) {
    if (!userKey) {
      throw new Error('HistoryStore requires a user key');
    }
    const hash = crypto.createHash('sha256').update(userKey).digest('hex').substring(0, 24);
    return path.join(this.baseDir, `${hash}.json`);
  }

  async _loadUserData(userKey) {
    const filePath = this._getUserFilePath(userKey);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      return {
        userKey,
        messages: Array.isArray(parsed.messages) ? parsed.messages : [],
        created: parsed.created || new Date().toISOString(),
        updated: parsed.updated || new Date().toISOString(),
      };
    } catch {
      const now = new Date().toISOString();
      return {
        userKey,
        messages: [],
        created: now,
        updated: now,
      };
    }
  }

  async _saveUserData(userKey, data) {
    await this._ensureDir();
    const filePath = this._getUserFilePath(userKey);
    const payload = {
      userKey,
      messages: cloneMessages(data.messages || []),
      created: data.created,
      updated: new Date().toISOString(),
    };
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
  }

  async getHistory(userKey) {
    if (!userKey) return [];
    const data = await this._loadUserData(userKey);
    return cloneMessages(data.messages || []);
  }

  async setHistory(userKey, messages = []) {
    if (!userKey) return;
    const data = await this._loadUserData(userKey);
    data.messages = cloneMessages(messages);
    await this._saveUserData(userKey, data);
  }

  async appendMessage(userKey, message, options = {}) {
    if (!userKey || !message) return [];
    const data = await this._loadUserData(userKey);
    const entry = {
      role: message.role,
      content: message.content,
      timestamp: message.timestamp || new Date().toISOString(),
    };
    data.messages.push(entry);
    if (Number.isInteger(options.maxEntries) && options.maxEntries > 0) {
      data.messages = data.messages.slice(-options.maxEntries);
    }
    await this._saveUserData(userKey, data);
    return cloneMessages(data.messages);
  }

  async clearHistory(userKey) {
    if (!userKey) return;
    const filePath = this._getUserFilePath(userKey);
    try {
      await fs.unlink(filePath);
    } catch {
      // File might not exist; ignore
    }
  }

  async clearAll() {
    try {
      await fs.rm(this.baseDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist; ignore
    }
  }
}

export default HistoryStore;
