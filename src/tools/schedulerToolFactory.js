const ACTIONS = ['schedule', 'list', 'cancel', 'clear'];
const MIN_INTERVAL_MINUTES = 5;
const MAX_INTERVAL_MINUTES = 24 * 60;
const MAX_COMMAND_LENGTH = 300;
const DEFAULT_MAX_JOBS_PER_USER = 5;

export const DELIVERY_MODES = {
  CHAT: 'chat',
  HEADLESS: 'headless',
};

function formatJob(job) {
  if (!job) {
    return null;
  }
  return {
    id: job.id,
    command: job.command,
    type: job.type,
    intervalMinutes: job.intervalMinutes,
    nextRunAt: job.nextRunAt,
    lastRunAt: job.lastRunAt,
    status: job.status,
    delivery: job.delivery || DELIVERY_MODES.CHAT,
    remainingRuns: job.remainingRuns ?? null,
  };
}

function ensureCronService(context) {
  const cronService = context?.services?.cron;
  if (!cronService) {
    throw new Error('Cron service is not configured.');
  }
  return cronService;
}

function normalizeMaxRuns(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('maxRuns must be a positive integer when provided.');
  }
  return parsed;
}

function validateStartAt(startAt) {
  if (!startAt) {
    return null;
  }
  const timestamp = Date.parse(startAt);
  if (Number.isNaN(timestamp)) {
    throw new Error('startAt must be an ISO 8601 timestamp.');
  }
  return new Date(timestamp).toISOString();
}

function normalizeType(value, allowedTypes, defaultType) {
  if (!allowedTypes || allowedTypes.length === 0) {
    return defaultType;
  }
  if (!value) {
    return defaultType;
  }
  const next = String(value).toLowerCase();
  return allowedTypes.includes(next) ? next : defaultType;
}

function buildParameters({ includeType, allowedTypes, typeDescription }) {
  const properties = {
    action: {
      type: 'string',
      description: 'The cron operation to perform.',
      enum: ACTIONS,
    },
    command: {
      type: 'string',
      description: 'Command to send to the assistant on each run (required for schedule).',
    },
    intervalMinutes: {
      type: 'number',
      description: 'Minutes between runs (required for schedule). Minimum 5 minutes.',
    },
    startAt: {
      type: 'string',
      description: 'Optional ISO timestamp for the first run. Defaults to now + interval.',
    },
    maxRuns: {
      type: 'integer',
      description: 'Optional limit for total runs. Defaults to unlimited.',
    },
    jobId: {
      type: 'string',
      description: 'Job number shown in cron list (1-5). Required for cancel.',
    },
  };

  if (includeType && allowedTypes?.length > 0) {
    properties.type = {
      type: 'string',
      description: typeDescription || 'Job intention.',
      enum: allowedTypes,
    };
  }

  return {
    type: 'object',
    properties,
    required: ['action'],
  };
}

export function createSchedulerTool(config) {
  return {
    name: config.name,
    description: config.description,
    category: 'automation',
    keywords: config.keywords,
    parameters: buildParameters({
      includeType: config.includeTypeOption,
      allowedTypes: config.allowedTypes,
      typeDescription: config.typeDescription,
    }),
    execute: async (args = {}, context = {}) => {
      try {
        const cronService = ensureCronService(context);
        const userId = context?.userId;
        const roomId = context?.roomId;

        if (!userId || !roomId) {
          return { error: `${config.name} tool requires user and room context.` };
        }

        const action = String(args.action || '').toLowerCase();
        if (!ACTIONS.includes(action)) {
          return { error: `Unsupported action. Use one of: ${ACTIONS.join(', ')}` };
        }

        if (action === 'list') {
          const jobs = await cronService.listJobs(userId);
          return { jobs: jobs.map(formatJob) };
        }

        if (action === 'cancel') {
          const jobId = String(args.jobId ?? '').trim();
          if (!jobId) {
            return { error: 'jobId is required to cancel a job.' };
          }
          const result = await cronService.cancelJob(jobId, userId);
          if (!result.success) {
            return { error: result.message };
          }
          return { success: true, job: formatJob(result.job) };
        }

        if (action === 'clear') {
          const result = await cronService.clearJobs(userId);
          const removed = result.removed || 0;
          return {
            success: true,
            removed,
            message:
              removed > 0
                ? `Cleared ${removed} scheduled job${removed === 1 ? '' : 's'}.`
                : 'No scheduled jobs to clear.',
          };
        }

        // schedule
        const command = (args.command || '').trim();
        if (!command) {
          return { error: 'command is required to schedule a job.' };
        }
        if (command.length > MAX_COMMAND_LENGTH) {
          return { error: `Command is too long (max ${MAX_COMMAND_LENGTH} characters).` };
        }

        const intervalMinutes = Number(args.intervalMinutes);
        if (!Number.isFinite(intervalMinutes)) {
          return { error: 'intervalMinutes must be a number.' };
        }
        if (intervalMinutes < MIN_INTERVAL_MINUTES || intervalMinutes > MAX_INTERVAL_MINUTES) {
          return {
            error: `intervalMinutes must be between ${MIN_INTERVAL_MINUTES} and ${MAX_INTERVAL_MINUTES}.`,
          };
        }

        const startAt = validateStartAt(args.startAt);
        const maxRuns = normalizeMaxRuns(args.maxRuns);
        const type = normalizeType(args.type, config.allowedTypes, config.defaultType);

        const summary = await cronService.scheduleJob({
          userId,
          roomId,
          command,
          intervalMinutes,
          startAt,
          maxRuns,
          type,
          delivery: config.deliveryMode,
        });

        const limit = cronService.maxJobsPerUser || DEFAULT_MAX_JOBS_PER_USER;
        const frequencyText = `${intervalMinutes} minute${intervalMinutes === 1 ? '' : 's'}`;
        const infoPrefix = config.infoPrefix || 'Scheduled';
        return {
          success: true,
          info: `${infoPrefix} job #${summary.id} every ${frequencyText}. You can have up to ${limit} active jobs.`,
          job: formatJob(summary),
        };
      } catch (error) {
        return { error: error.message };
      }
    },
  };
}

export const schedulerToolConstants = {
  ACTIONS,
  MIN_INTERVAL_MINUTES,
  MAX_INTERVAL_MINUTES,
  MAX_COMMAND_LENGTH,
  DEFAULT_MAX_JOBS_PER_USER,
};
