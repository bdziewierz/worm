export const calculateTool = {
  name: 'calculate',
  description: 'Evaluate math expressions (arithmetic, sqrt, sin, cos, tan, abs)',
  category: 'math',
  keywords: ['calculate', 'math', 'compute', 'multiply', 'divide', 'add', 'subtract'],
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description:
          'The mathematical expression to evaluate (e.g., "2 + 2", "sqrt(16)", "10 * 5 + 3")',
      },
    },
    required: ['expression'],
  },
  execute: async args => {
    try {
      const { expression } = args;

      // Basic safety check - only allow numbers, operators, and common math functions
      const safePattern = /^[\d\s+\-*/().%^sqrtabssincotan,]+$/i;
      if (!safePattern.test(expression)) {
        return {
          error: 'Invalid expression. Only numbers and basic math operations are allowed.',
        };
      }

      // Replace function names with Math equivalents
      const safeExpression = expression
        .replace(/sqrt\(/g, 'Math.sqrt(')
        .replace(/abs\(/g, 'Math.abs(')
        .replace(/sin\(/g, 'Math.sin(')
        .replace(/cos\(/g, 'Math.cos(')
        .replace(/tan\(/g, 'Math.tan(')
        .replace(/\^/g, '**'); // Convert ^ to **

      // Evaluate using Function constructor (safer than eval)
      const result = Function(`"use strict"; return (${safeExpression})`)();

      return {
        expression: expression,
        result: result,
        formatted: `${expression} = ${result}`,
      };
    } catch (error) {
      return {
        error: `Calculation error: ${error.message}`,
        expression: args.expression,
      };
    }
  },
};
