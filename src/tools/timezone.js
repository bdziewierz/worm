export const timezoneTool = {
  name: 'convert_timezone',
  description: 'Convert time between different timezones',
  category: 'time',
  keywords: ['timezone', 'time', 'convert', 'utc', 'gmt', 'zone'],
  parameters: {
    type: 'object',
    properties: {
      time: {
        type: 'string',
        description: 'Time to convert (ISO format like "2026-02-01T10:30:00" or "10:30")'
      },
      from_timezone: {
        type: 'string',
        description: 'Source timezone (e.g., "America/New_York", "Europe/London", "UTC")'
      },
      to_timezone: {
        type: 'string',
        description: 'Target timezone (e.g., "Asia/Tokyo", "America/Los_Angeles")'
      }
    },
    required: ['time', 'from_timezone', 'to_timezone']
  },
  execute: async (args) => {
    try {
      const { time, from_timezone, to_timezone } = args;

      // If time is just HH:MM, assume today's date
      let dateTime;
      if (time.match(/^\d{1,2}:\d{2}$/)) {
        const now = new Date();
        const [hours, minutes] = time.split(':');
        dateTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(hours), parseInt(minutes));
      } else {
        dateTime = new Date(time);
      }

      if (isNaN(dateTime.getTime())) {
        return {
          error: `Invalid time format: ${time}. Use ISO format (2026-02-01T10:30:00) or HH:MM`
        };
      }

      // Format time in source timezone
      const sourceFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: from_timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });

      // Format time in target timezone
      const targetFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: to_timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });

      const sourceTime = sourceFormatter.format(dateTime);
      const targetTime = targetFormatter.format(dateTime);

      return {
        source: {
          timezone: from_timezone,
          time: sourceTime
        },
        target: {
          timezone: to_timezone,
          time: targetTime
        },
        summary: `${sourceTime} ${from_timezone} = ${targetTime} ${to_timezone}`
      };

    } catch (error) {
      return {
        error: `Timezone conversion failed: ${error.message}`,
        hint: 'Use IANA timezone names like "America/New_York", "Europe/London", "Asia/Tokyo"'
      };
    }
  }
};
