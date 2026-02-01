export const getCurrentTimeTool = {
  name: 'get_current_time',
  description: 'Get current date/time with optional timezone',
  parameters: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: 'Optional timezone (e.g., "America/New_York", "Europe/London")',
      }
    },
    required: []
  },
  execute: async (args) => {
    const timezone = args.timezone;
    const now = new Date();
    
    if (timezone) {
      try {
        return {
          timestamp: now.toISOString(),
          formatted: now.toLocaleString('en-US', { timeZone: timezone }),
          timezone: timezone
        };
      } catch (error) {
        return {
          error: `Invalid timezone: ${timezone}`,
          timestamp: now.toISOString()
        };
      }
    }
    
    return {
      timestamp: now.toISOString(),
      formatted: now.toLocaleString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
  }
};
