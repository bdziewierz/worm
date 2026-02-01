export const loremTool = {
  name: 'generate_lorem',
  description: 'Generate Lorem Ipsum placeholder text',
  category: 'utility',
  keywords: ['lorem', 'ipsum', 'placeholder', 'text', 'dummy', 'filler'],
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description: 'Type of content: "words", "sentences", "paragraphs" (default: "paragraphs")'
      },
      count: {
        type: 'number',
        description: 'Number of words/sentences/paragraphs to generate (default: 3, max: 20)'
      }
    }
  },
  execute: async (args) => {
    try {
      const { type = 'paragraphs', count = 3 } = args;
      const num = Math.min(Math.max(count, 1), 20);

      const words = [
        'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit',
        'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore',
        'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam', 'quis', 'nostrud',
        'exercitation', 'ullamco', 'laboris', 'nisi', 'aliquip', 'ex', 'ea', 'commodo',
        'consequat', 'duis', 'aute', 'irure', 'in', 'reprehenderit', 'voluptate',
        'velit', 'esse', 'cillum', 'fugiat', 'nulla', 'pariatur', 'excepteur',
        'sint', 'occaecat', 'cupidatat', 'non', 'proident', 'sunt', 'culpa', 'qui',
        'officia', 'deserunt', 'mollit', 'anim', 'id', 'est', 'laborum'
      ];

      const generateWord = () => words[Math.floor(Math.random() * words.length)];
      
      const generateSentence = () => {
        const length = Math.floor(Math.random() * 10) + 5; // 5-15 words
        const sentence = Array.from({ length }, generateWord).join(' ');
        return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
      };

      const generateParagraph = () => {
        const sentences = Math.floor(Math.random() * 4) + 3; // 3-7 sentences
        return Array.from({ length: sentences }, generateSentence).join(' ');
      };

      let result;
      
      switch (type.toLowerCase()) {
        case 'words':
          result = Array.from({ length: num }, generateWord).join(' ');
          break;

        case 'sentences':
          result = Array.from({ length: num }, generateSentence).join(' ');
          break;

        case 'paragraphs':
        default:
          result = Array.from({ length: num }, generateParagraph).join('\n\n');
          break;
      }

      return {
        type: type,
        count: num,
        text: result,
        length: result.length,
        summary: `Generated ${num} ${type} (${result.length} characters)`
      };

    } catch (error) {
      return {
        error: `Lorem ipsum generation failed: ${error.message}`
      };
    }
  }
};
