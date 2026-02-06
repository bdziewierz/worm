import { DELIVERY_MODES, createSchedulerTool } from './schedulerToolFactory.js';

export const remindTool = createSchedulerTool({
  name: 'remind',
  description: 'Schedule chat reminders that appear in the current room with conversation context.',
  keywords: ['remind', 'reminder', 'schedule', 'timer'],
  allowedTypes: ['reminder'],
  defaultType: 'reminder',
  includeTypeOption: false,
  deliveryMode: DELIVERY_MODES.CHAT,
  infoPrefix: 'Scheduled reminder',
});
