import fs from 'node:fs/promises';
import path from 'node:path';

const resolveLogPath = () => {
  const override = process.env.CRON_RUN_LOG_PATH || process.env.__CRON_LOG_OVERRIDE__ || null;
  if (override) {
    return path.resolve(override);
  }
  return path.resolve(process.cwd(), 'memory', 'cron-runs.log');
};

export async function logCronRun(entry = {}) {
  try {
    const logPath = resolveLogPath();
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    const payload = {
      timestamp: new Date().toISOString(),
      ...entry,
    };
    await fs.appendFile(logPath, `${JSON.stringify(payload)}\n`, 'utf-8');
  } catch (error) {
    console.error(`Failed to log cron run: ${error.message}`);
  }
}

export default logCronRun;
