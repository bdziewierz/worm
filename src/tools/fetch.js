import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '_',
});

// Remove unnecessary elements
turndownService.remove(['script', 'style', 'nav', 'footer', 'aside', 'iframe', 'noscript']);

async function fetchAndConvert(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WORM/1.0; +https://github.com/yourusername/worm)',
      },
      timeout: 10000,
    });

    if (!response.ok) {
      return { error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
      return {
        error: 'Could not extract article content. Page might be too complex or behind a paywall.',
      };
    }

    // Convert extracted HTML to markdown
    const markdown = turndownService.turndown(article.content);

    // Clean up excessive whitespace
    const cleaned = markdown
      .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
      .replace(/[ \t]+$/gm, '') // Trim trailing spaces
      .trim();

    // Truncate if too long (keep under ~2000 chars for token budget)
    const maxLength = 2000;
    const truncated =
      cleaned.length > maxLength
        ? cleaned.substring(0, maxLength) + '\n\n[Content truncated...]'
        : cleaned;

    return {
      title: article.title,
      byline: article.byline,
      excerpt: article.excerpt,
      content: truncated,
      length: article.length,
      url: url,
    };
  } catch (error) {
    if (error.name === 'AbortError' || error.code === 'ETIMEDOUT') {
      return { error: 'Request timed out after 10 seconds' };
    }
    return { error: error.message };
  }
}

export const fetchTool = {
  name: 'fetch',
  description:
    'Fetch and extract main content from a web page as clean markdown. Use for reading articles, blog posts, or documentation.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch content from. Must be a valid http or https URL.',
      },
    },
    required: ['url'],
  },
  execute: async args => {
    if (!args.url || typeof args.url !== 'string') {
      return { error: 'URL is required and must be a string' };
    }

    const url = args.url.trim();

    // Validate URL format
    try {
      const parsed = new globalThis.URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { error: 'URL must use http or https protocol' };
      }
    } catch {
      return { error: 'Invalid URL format' };
    }

    return await fetchAndConvert(url);
  },
};
