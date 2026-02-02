async function getWikipediaExtract(title) {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(title)}`;
    const response = await fetch(url);

    if (!response.ok) return null;

    const data = await response.json();
    const pages = data.query?.pages || {};
    const page = Object.values(pages)[0];

    if (!page || page.missing) return null;

    // Truncate to ~500 chars for token budget
    const extract = page.extract || '';
    return extract.length > 500 ? extract.substring(0, 500) + '...' : extract;
  } catch {
    return null;
  }
}

export const searchTool = {
  name: 'search',
  description:
    'Search Wikipedia for factual information. Use for definitions, historical facts, people, places, concepts.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query (e.g., "Node.js", "Albert Einstein", "photosynthesis")',
      },
    },
    required: ['query'],
  },
  execute: async args => {
    try {
      const { query } = args;

      if (!query || typeof query !== 'string') {
        return { error: 'Query is required and must be a string' };
      }

      // Use Wikipedia OpenSearch API (no key required)
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&format=json&search=${encodeURIComponent(query)}&limit=3`;
      const response = await fetch(searchUrl);

      if (!response.ok) {
        return { error: 'Wikipedia search failed' };
      }

      const data = await response.json();
      // OpenSearch returns: [query, [titles], [descriptions], [urls]]
      const titles = data[1] || [];
      const descriptions = data[2] || [];
      const urls = data[3] || [];

      if (titles.length === 0) {
        return {
          query: query,
          summary: 'No Wikipedia articles found. Try rephrasing your query.',
          results: [],
        };
      }

      // Get extract for the top result
      const topTitle = titles[0];
      const extract = await getWikipediaExtract(topTitle);

      const results = titles.slice(0, 3).map((title, i) => ({
        title: title,
        description: descriptions[i] || '',
        url: urls[i] || '',
      }));

      return {
        query: query,
        title: topTitle,
        extract: extract || descriptions[0] || 'No extract available.',
        url: urls[0],
        related: results.slice(1),
        summary: extract
          ? `${topTitle}: ${extract} (${urls[0]})`
          : `${topTitle}: ${descriptions[0]} (${urls[0]})`,
      };
    } catch (error) {
      return {
        error: error.message,
      };
    }
  },
};
