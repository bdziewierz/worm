import { Memory } from '../lib/memory.js';

const memory = new Memory();

export const rememberTool = {
  name: 'remember',
  description:
    'Store important facts about the user. Call when user shares preferences, projects, dates, or personal context.',
  parameters: {
    type: 'object',
    properties: {
      fact: {
        type: 'string',
        description: 'The fact to remember. Be specific and concise.',
      },
    },
    required: ['fact'],
  },
  execute: async (args, context) => {
    try {
      if (!args.fact || typeof args.fact !== 'string') {
        return { error: 'Fact is required and must be a string' };
      }

      if (!context?.userId) {
        return { error: 'User context is required to remember facts' };
      }

      const fact = args.fact.trim();
      if (fact.length === 0) {
        return { error: 'Fact cannot be empty' };
      }

      if (fact.length > 200) {
        return { error: 'Fact is too long (max 200 characters)' };
      }

      const count = await memory.addFact(context.userId, fact);
      return {
        success: true,
        message: `Stored fact. Total facts: ${count}`,
      };
    } catch (error) {
      return { error: error.message };
    }
  },
};
