export const textAnalyzerTool = {
  name: 'analyze_text',
  description: 'Analyze text: count words, characters, sentences, estimate reading time',
  category: 'utility',
  keywords: ['text', 'analyze', 'count', 'words', 'characters', 'reading', 'statistics'],
  parameters: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The text to analyze'
      }
    },
    required: ['text']
  },
  execute: async (args) => {
    try {
      const { text } = args;

      // Word count
      const words = text.trim().split(/\s+/).filter(word => word.length > 0);
      const wordCount = words.length;

      // Character counts
      const charCount = text.length;
      const charCountNoSpaces = text.replace(/\s/g, '').length;

      // Sentence count (approximate)
      const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
      const sentenceCount = sentences.length;

      // Paragraph count
      const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
      const paragraphCount = paragraphs.length;

      // Reading time (average 200-250 words per minute)
      const readingTimeMinutes = Math.ceil(wordCount / 225);

      // Average word length
      const avgWordLength = words.length > 0 
        ? (words.reduce((sum, word) => sum + word.length, 0) / words.length).toFixed(1)
        : 0;

      // Most common words (top 5, excluding very short words)
      const wordFreq = {};
      words.forEach(word => {
        const normalized = word.toLowerCase().replace(/[^\w]/g, '');
        if (normalized.length >= 3) {
          wordFreq[normalized] = (wordFreq[normalized] || 0) + 1;
        }
      });
      
      const topWords = Object.entries(wordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([word, count]) => `${word} (${count})`);

      return {
        words: wordCount,
        characters: charCount,
        characters_no_spaces: charCountNoSpaces,
        sentences: sentenceCount,
        paragraphs: paragraphCount,
        reading_time: `${readingTimeMinutes} min`,
        avg_word_length: avgWordLength,
        top_words: topWords,
        summary: `${wordCount} words, ${charCount} chars, ${sentenceCount} sentences, ~${readingTimeMinutes} min read`
      };

    } catch (error) {
      return {
        error: `Text analysis failed: ${error.message}`
      };
    }
  }
};
