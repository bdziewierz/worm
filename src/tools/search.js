export const searchTool = {
  name: 'web_search',
  description: 'Search the web for information using DuckDuckGo',
  category: 'search',
  keywords: ['search', 'google', 'find', 'look up', 'web', 'internet', 'query'],
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query (e.g., "capital of France", "what is JavaScript")'
      }
    },
    required: ['query']
  },
  execute: async (args) => {
    try {
      const { query } = args;

      // Use DuckDuckGo Instant Answer API (no key required)
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const response = await fetch(url);

      if (!response.ok) {
        return { error: 'Search request failed' };
      }

      const data = await response.json();

      // Extract relevant information
      const results = {
        query: query,
        answer: data.AbstractText || data.Answer || null,
        source: data.AbstractURL || data.AnswerURL || null,
        related: data.RelatedTopics?.slice(0, 3).map(topic => ({
          text: topic.Text?.substring(0, 100) || '',
          url: topic.FirstURL || ''
        })).filter(r => r.text) || []
      };

      // Create summary
      if (results.answer) {
        return {
          ...results,
          summary: `${results.answer}${results.source ? ` (Source: ${results.source})` : ''}`
        };
      } else if (results.related.length > 0) {
        return {
          ...results,
          summary: `Found ${results.related.length} related topics. Top result: ${results.related[0].text}`
        };
      } else {
        return {
          query: query,
          summary: `No instant answer found for "${query}". Try rephrasing or being more specific.`
        };
      }

    } catch (error) {
      return {
        error: `Search failed: ${error.message}`,
        query: args.query
      };
    }
  }
};
