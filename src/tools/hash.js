import crypto from 'crypto';

export const hashTool = {
  name: 'generate_hash',
  description: 'Generate cryptographic hash of text (MD5, SHA256, SHA512)',
  category: 'utility',
  keywords: ['hash', 'md5', 'sha256', 'checksum', 'digest', 'crypto'],
  parameters: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The text to hash',
      },
      algorithm: {
        type: 'string',
        description: 'Hash algorithm: "md5", "sha256", "sha512" (default: "sha256")',
      },
    },
    required: ['text'],
  },
  execute: async args => {
    try {
      const { text, algorithm = 'sha256' } = args;
      const algo = algorithm.toLowerCase();

      const supportedAlgorithms = ['md5', 'sha256', 'sha512', 'sha1'];

      if (!supportedAlgorithms.includes(algo)) {
        return {
          error: `Unsupported algorithm: ${algorithm}`,
          supported: supportedAlgorithms.join(', '),
        };
      }

      const hash = crypto.createHash(algo).update(text, 'utf-8').digest('hex');

      return {
        algorithm: algo,
        input_length: text.length,
        hash: hash,
        summary: `${algo.toUpperCase()} hash: ${hash}`,
      };
    } catch (error) {
      return {
        error: `Hash generation failed: ${error.message}`,
      };
    }
  },
};
