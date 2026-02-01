export const jsonTool = {
  name: 'format_json',
  description: 'Validate, format, minify, or query JSON data',
  category: 'utility',
  keywords: ['json', 'format', 'validate', 'parse', 'minify', 'pretty'],
  parameters: {
    type: 'object',
    properties: {
      json_string: {
        type: 'string',
        description: 'The JSON string to process'
      },
      operation: {
        type: 'string',
        description: 'Operation: "format" (pretty print), "minify" (compact), "validate" (check validity)'
      }
    },
    required: ['json_string', 'operation']
  },
  execute: async (args) => {
    try {
      const { json_string, operation } = args;

      // First, validate the JSON
      let parsed;
      try {
        parsed = JSON.parse(json_string);
      } catch (parseError) {
        return {
          valid: false,
          error: `Invalid JSON: ${parseError.message}`,
          operation: operation
        };
      }

      switch (operation.toLowerCase()) {
        case 'validate':
          return {
            valid: true,
            type: Array.isArray(parsed) ? 'array' : typeof parsed,
            summary: 'Valid JSON'
          };

        case 'format':
        case 'pretty':
          const formatted = JSON.stringify(parsed, null, 2);
          return {
            valid: true,
            formatted: formatted,
            lines: formatted.split('\n').length,
            size: formatted.length,
            summary: `Formatted JSON (${formatted.split('\n').length} lines)`
          };

        case 'minify':
        case 'compact':
          const minified = JSON.stringify(parsed);
          return {
            valid: true,
            minified: minified,
            size: minified.length,
            summary: `Minified JSON (${minified.length} bytes)`
          };

        default:
          return {
            error: `Unknown operation: ${operation}`,
            supported: 'format, minify, validate'
          };
      }

    } catch (error) {
      return {
        error: `JSON processing failed: ${error.message}`
      };
    }
  }
};
