import { Memory } from '../lib/memory.js';

const memory = new Memory();

export const recallTool = {
  name: 'recall',
  description:
    'List all stored facts about the user. Use for debugging or when user asks what you remember.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async (args, context) => {
    try {
      if (!context?.userId) {
        return { error: 'User context is required to recall facts' };
      }

      const facts = await memory.getUserFacts(context.userId);
      if (facts.length === 0) {
        return { message: 'No facts stored yet.' };
      }

      return {
        facts: facts,
        count: facts.length,
      };
    } catch (error) {
      return { error: error.message };
    }
  },
};
