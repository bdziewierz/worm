import fs from 'node:fs';
import path from 'node:path';

const LOG_FILE_PATH = path.resolve(process.cwd(), 'memory', 'llm-payload.log');
const parseBooleanFlag = value => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
};

const resolvedFlag =
  parseBooleanFlag(process.env.LLM_LOGGING) ?? parseBooleanFlag(process.env.LLM_LOGGING_ENABLED);

const LOGGING_ENABLED = resolvedFlag ?? true;
let logInitialized = false;

const ensureLogFile = () => {
  if (!LOGGING_ENABLED || logInitialized) return;
  try {
    fs.mkdirSync(path.dirname(LOG_FILE_PATH), { recursive: true });
    fs.writeFileSync(LOG_FILE_PATH, JSON.stringify([], null, 2));
    logInitialized = true;
  } catch (error) {
    console.error(`Failed to initialize LLM payload log: ${error.message}`);
  }
};

const readEntries = () => {
  if (!LOGGING_ENABLED) return [];
  try {
    const raw = fs.readFileSync(LOG_FILE_PATH, 'utf8');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeEntries = entries => {
  if (!LOGGING_ENABLED) return;
  try {
    fs.writeFileSync(LOG_FILE_PATH, JSON.stringify(entries, null, 2));
  } catch (error) {
    console.error(`Failed to persist LLM payload log: ${error.message}`);
  }
};

export const resetLlmLog = () => {
  if (!LOGGING_ENABLED) return;
  try {
    fs.mkdirSync(path.dirname(LOG_FILE_PATH), { recursive: true });
    fs.writeFileSync(LOG_FILE_PATH, JSON.stringify([], null, 2));
    logInitialized = true;
  } catch (error) {
    console.error(`Failed to reset LLM payload log: ${error.message}`);
  }
};

export const logLlmPayload = (label, payload) => {
  if (!LOGGING_ENABLED) return;
  ensureLogFile();
  const entry = {
    timestamp: new Date().toISOString(),
    label,
    payload,
  };

  let serialized = '';
  try {
    serialized = JSON.stringify(entry, null, 2);
  } catch (error) {
    console.log(`[LLM] ${label} payload could not be stringified: ${error.message}`);
    serialized = JSON.stringify({
      timestamp: entry.timestamp,
      label,
      error: error.message,
    });
  }

  const entries = readEntries();
  entries.push(entry);
  writeEntries(entries);
};
