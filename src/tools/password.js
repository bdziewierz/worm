import crypto from 'crypto';

export const passwordTool = {
  name: 'generate_password',
  description: 'Generate a secure random password',
  category: 'utility',
  keywords: ['password', 'generate', 'secure', 'random', 'passphrase'],
  parameters: {
    type: 'object',
    properties: {
      length: {
        type: 'number',
        description: 'Password length (default: 16, min: 8, max: 64)',
      },
      include_symbols: {
        type: 'boolean',
        description: 'Include special characters (default: true)',
      },
      include_numbers: {
        type: 'boolean',
        description: 'Include numbers (default: true)',
      },
      include_uppercase: {
        type: 'boolean',
        description: 'Include uppercase letters (default: true)',
      },
    },
  },
  execute: async args => {
    try {
      const {
        length = 16,
        include_symbols = true,
        include_numbers = true,
        include_uppercase = true,
      } = args;

      const len = Math.min(Math.max(length, 8), 64);

      let charset = 'abcdefghijklmnopqrstuvwxyz';
      if (include_uppercase) {
        charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      }
      if (include_numbers) {
        charset += '0123456789';
      }
      if (include_symbols) {
        charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';
      }

      let password = '';
      const randomBytes = crypto.randomBytes(len);

      for (let i = 0; i < len; i++) {
        const randomIndex = randomBytes[i] % charset.length;
        password += charset[randomIndex];
      }

      // Ensure at least one character from each enabled category
      const categories = [];
      if (include_uppercase) categories.push('uppercase');
      if (include_numbers) categories.push('numbers');
      if (include_symbols) categories.push('symbols');

      return {
        password: password,
        length: password.length,
        strength: len >= 16 ? 'strong' : len >= 12 ? 'medium' : 'weak',
        includes: {
          lowercase: true,
          uppercase: include_uppercase,
          numbers: include_numbers,
          symbols: include_symbols,
        },
        summary: `Generated ${password.length}-character ${len >= 16 ? 'strong' : 'medium'} password`,
      };
    } catch (error) {
      return {
        error: `Password generation failed: ${error.message}`,
      };
    }
  },
};
