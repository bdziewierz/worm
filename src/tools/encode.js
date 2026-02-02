export const encodeTool = {
  name: 'encode_decode',
  description: 'Encode or decode text (base64, URL encoding, hex)',
  category: 'utility',
  keywords: ['encode', 'decode', 'base64', 'url', 'hex', 'encoding'],
  parameters: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The text to encode or decode',
      },
      operation: {
        type: 'string',
        description:
          'Operation to perform: "base64_encode", "base64_decode", "url_encode", "url_decode", "hex_encode", "hex_decode"',
      },
    },
    required: ['text', 'operation'],
  },
  execute: async args => {
    try {
      const { text, operation } = args;

      let result;

      switch (operation.toLowerCase()) {
        case 'base64_encode':
          result = Buffer.from(text, 'utf-8').toString('base64');
          break;

        case 'base64_decode':
          result = Buffer.from(text, 'base64').toString('utf-8');
          break;

        case 'url_encode':
          result = encodeURIComponent(text);
          break;

        case 'url_decode':
          result = decodeURIComponent(text);
          break;

        case 'hex_encode':
          result = Buffer.from(text, 'utf-8').toString('hex');
          break;

        case 'hex_decode':
          result = Buffer.from(text, 'hex').toString('utf-8');
          break;

        default:
          return {
            error: `Unknown operation: ${operation}`,
            supported:
              'base64_encode, base64_decode, url_encode, url_decode, hex_encode, hex_decode',
          };
      }

      return {
        input: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
        operation: operation,
        result: result,
        length: result.length,
      };
    } catch (error) {
      return {
        error: `Encoding/decoding failed: ${error.message}`,
        operation: args.operation,
      };
    }
  },
};
