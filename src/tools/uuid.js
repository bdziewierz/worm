import crypto from 'crypto';

export const uuidTool = {
  name: 'generate_uuid',
  description: 'Generate a random UUID (v4)',
  category: 'utility',
  keywords: ['uuid', 'guid', 'id', 'generate', 'random', 'identifier'],
  parameters: {
    type: 'object',
    properties: {
      count: {
        type: 'number',
        description: 'Number of UUIDs to generate (default: 1, max: 10)',
      },
    },
  },
  execute: async args => {
    try {
      const count = Math.min(Math.max(args.count || 1, 1), 10);
      const uuids = [];

      for (let i = 0; i < count; i++) {
        uuids.push(crypto.randomUUID());
      }

      if (count === 1) {
        return {
          uuid: uuids[0],
          summary: `Generated UUID: ${uuids[0]}`,
        };
      } else {
        return {
          uuids: uuids,
          count: count,
          summary: `Generated ${count} UUIDs`,
        };
      }
    } catch (error) {
      return {
        error: `UUID generation failed: ${error.message}`,
      };
    }
  },
};
