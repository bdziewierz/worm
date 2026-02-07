const DEFAULT_RESULT_LIMIT = 5;
const DEFAULT_API_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';

function mapWebResults(items = []) {
  return items.slice(0, DEFAULT_RESULT_LIMIT).map(item => ({
    title: item.title || item.subtype || 'Untitled result',
    url: item.url,
    snippet: item.description || item.snippet || '',
    language: item.language || null,
    familyFriendly: item.is_family_friendly ?? null,
    source: item.profile?.name || item.meta_url?.domain || null,
  }));
}

export const searchTool = {
  name: 'search',
  description:
    'Search the public web via Brave Search and return concise result links suitable for follow-up fetches.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Search phrase to look up on the web (e.g., "best fiber sources", "UUID RFC").',
      },
      count: {
        type: 'number',
        description: `Optional maximum number of links (default ${DEFAULT_RESULT_LIMIT}, max 10).`,
      },
    },
    required: ['query'],
  },
  execute: async args => {
    try {
      const { query } = args;
      const requestedCount = Number(args.count);
      const limit = Number.isFinite(requestedCount)
        ? Math.max(1, Math.min(10, Math.floor(requestedCount)))
        : DEFAULT_RESULT_LIMIT;

      if (!query || typeof query !== 'string') {
        return { error: 'Query is required and must be a string' };
      }

      const apiKey = process.env.BRAVE_SEARCH_API_KEY;
      if (!apiKey) {
        return {
          error:
            'Brave Search API key is not configured. Set BRAVE_SEARCH_API_KEY in the environment.',
        };
      }

      const endpoint = process.env.BRAVE_SEARCH_API_URL || DEFAULT_API_ENDPOINT;
      const url = new globalThis.URL(endpoint);
      url.searchParams.set('q', query.trim());
      url.searchParams.set('count', String(limit));

      const response = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey,
        },
      });

      if (!response.ok) {
        return { error: `Brave Search failed with status ${response.status}` };
      }

      const data = await response.json();
      const webResults = mapWebResults(data.web?.results || []);

      if (webResults.length === 0) {
        return {
          query,
          results: [],
          summary: 'No web results found. Try adjusting your query.',
        };
      }

      const topResult = webResults[0];
      const summary = topResult.snippet
        ? `${topResult.title}: ${topResult.snippet}`
        : `Top result: ${topResult.title}`;

      return {
        query,
        results: webResults,
        summary,
        top: topResult,
      };
    } catch (error) {
      return { error: error.message };
    }
  },
};
