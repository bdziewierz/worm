import { DELIVERY_MODES, createSchedulerTool } from './schedulerToolFactory.js';

export const cronTool = createSchedulerTool({
  name: 'cron',
  description:
    'Schedule headless recurring commands for the assistant to run automatically. Results are logged instead of posted in chat.',
  keywords: ['cron', 'automation', 'headless', 'schedule', 'command', 'job'],
  allowedTypes: ['command'],
  defaultType: 'command',
  includeTypeOption: false,
  deliveryMode: DELIVERY_MODES.HEADLESS,
  infoPrefix: 'Scheduled headless',
});
