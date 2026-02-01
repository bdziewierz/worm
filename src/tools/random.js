import crypto from 'crypto';

export const randomTool = {
  name: 'random_choice',
  description: 'Make random choices: pick from options, generate random numbers, flip coins',
  category: 'utility',
  keywords: ['random', 'choose', 'pick', 'decide', 'coin', 'flip', 'choice', 'number'],
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description: 'Type of random selection: "choice" (pick from list), "number" (random number), "coin" (flip coin), "dice" (roll dice)'
      },
      options: {
        type: 'array',
        description: 'For type "choice": array of options to choose from (e.g., ["pizza", "burger", "sushi"])',
        items: { type: 'string' }
      },
      min: {
        type: 'number',
        description: 'For type "number": minimum value (default: 1)'
      },
      max: {
        type: 'number',
        description: 'For type "number": maximum value (default: 100)'
      },
      count: {
        type: 'number',
        description: 'Number of selections/rolls (default: 1, max: 10)'
      }
    },
    required: ['type']
  },
  execute: async (args) => {
    try {
      const { type, options, min = 1, max = 100, count = 1 } = args;
      const numSelections = Math.min(Math.max(count, 1), 10);

      switch (type.toLowerCase()) {
        case 'choice':
          if (!options || options.length === 0) {
            return { error: 'No options provided for random choice' };
          }

          const choices = [];
          for (let i = 0; i < numSelections; i++) {
            const randomIndex = crypto.randomInt(0, options.length);
            choices.push(options[randomIndex]);
          }

          return {
            type: 'choice',
            options: options,
            selected: numSelections === 1 ? choices[0] : choices,
            summary: numSelections === 1
              ? `Randomly selected: ${choices[0]}`
              : `Randomly selected ${numSelections}: ${choices.join(', ')}`
          };

        case 'number':
          const numbers = [];
          for (let i = 0; i < numSelections; i++) {
            numbers.push(crypto.randomInt(min, max + 1));
          }

          return {
            type: 'number',
            range: `${min}-${max}`,
            result: numSelections === 1 ? numbers[0] : numbers,
            summary: numSelections === 1
              ? `Random number: ${numbers[0]}`
              : `Random numbers: ${numbers.join(', ')}`
          };

        case 'coin':
          const flips = [];
          for (let i = 0; i < numSelections; i++) {
            flips.push(crypto.randomInt(0, 2) === 0 ? 'Heads' : 'Tails');
          }

          return {
            type: 'coin_flip',
            result: numSelections === 1 ? flips[0] : flips,
            summary: numSelections === 1
              ? `Coin flip: ${flips[0]}`
              : `Coin flips: ${flips.join(', ')}`
          };

        case 'dice':
          const rolls = [];
          for (let i = 0; i < numSelections; i++) {
            rolls.push(crypto.randomInt(1, 7));
          }

          return {
            type: 'dice_roll',
            result: numSelections === 1 ? rolls[0] : rolls,
            total: rolls.reduce((sum, val) => sum + val, 0),
            summary: numSelections === 1
              ? `Dice roll: ${rolls[0]}`
              : `Dice rolls: ${rolls.join(', ')} (total: ${rolls.reduce((sum, val) => sum + val, 0)})`
          };

        default:
          return {
            error: `Unknown type: ${type}`,
            supported: 'choice, number, coin, dice'
          };
      }

    } catch (error) {
      return {
        error: `Random selection failed: ${error.message}`
      };
    }
  }
};
