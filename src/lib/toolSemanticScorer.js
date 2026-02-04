const DEFAULT_MAX_TOOLS = 3;
const DEFAULT_STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'if',
  'then',
  'else',
  'for',
  'to',
  'of',
  'in',
  'on',
  'at',
  'by',
  'with',
  'from',
  'as',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
  'i',
  'you',
  'we',
  'they',
  'me',
  'my',
  'your',
  'our',
  'their',
]);

export class ToolSemanticScorer {
  constructor(options = {}) {
    const maxTools = Number.isInteger(options.maxTools) ? options.maxTools : DEFAULT_MAX_TOOLS;
    this.maxTools = Math.max(0, maxTools);
    this.stopwords = options.stopwords instanceof Set ? options.stopwords : DEFAULT_STOPWORDS;
  }

  selectTools(messages, tools = []) {
    if (!Array.isArray(tools) || tools.length === 0 || this.maxTools === 0) {
      return [];
    }

    const coreTools = tools.filter(tool => tool?.core);
    const remainingTools = tools.filter(tool => !tool?.core);
    const query = this._getLastUserMessage(messages);
    const scored = this._scoreTools(query, remainingTools);

    return [...coreTools, ...scored.map(entry => entry.tool)].slice(0, this.maxTools);
  }

  _getLastUserMessage(messages = []) {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message?.role === 'user' && typeof message.content === 'string') {
        return message.content;
      }
    }
    return '';
  }

  _tokenize(text) {
    if (!text) return [];
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .map(token => token.trim())
      .filter(token => token.length > 1 && !this.stopwords.has(token));
  }

  _buildToolText(tool) {
    const keywords = Array.isArray(tool?.keywords) ? tool.keywords.join(' ') : '';
    return `${tool?.name || ''} ${tool?.description || ''} ${tool?.category || ''} ${keywords}`.trim();
  }

  _buildTermFrequency(tokens = []) {
    const tf = new Map();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }
    return tf;
  }

  _buildIdf(docTokensList) {
    const docCount = docTokensList.length || 1;
    const docFreq = new Map();

    for (const tokens of docTokensList) {
      const uniqueTokens = new Set(tokens);
      for (const token of uniqueTokens) {
        docFreq.set(token, (docFreq.get(token) || 0) + 1);
      }
    }

    const idf = new Map();
    for (const [token, count] of docFreq.entries()) {
      const value = Math.log((docCount + 1) / (count + 1)) + 1;
      idf.set(token, value);
    }

    return idf;
  }

  _vectorize(tokens, idf) {
    const tf = this._buildTermFrequency(tokens);
    const vector = new Map();
    for (const [token, freq] of tf.entries()) {
      const weight = (idf.get(token) || 1) * (1 + Math.log(freq));
      vector.set(token, weight);
    }
    return vector;
  }

  _cosineSimilarity(vecA, vecB) {
    if (!vecA.size || !vecB.size) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (const value of vecA.values()) {
      normA += value * value;
    }
    for (const value of vecB.values()) {
      normB += value * value;
    }

    for (const [token, weightA] of vecA.entries()) {
      const weightB = vecB.get(token);
      if (weightB) {
        dot += weightA * weightB;
      }
    }

    if (!normA || !normB) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  _scoreTools(query, tools) {
    const queryTokens = this._tokenize(query);
    const docTokensList = tools.map(tool => this._tokenize(this._buildToolText(tool)));
    const idf = this._buildIdf(docTokensList);
    const queryVector = this._vectorize(queryTokens, idf);
    const lowerQuery = query.toLowerCase();

    return tools
      .map((tool, index) => {
        const toolVector = this._vectorize(docTokensList[index], idf);
        let score = this._cosineSimilarity(queryVector, toolVector);

        if (tool?.name && lowerQuery.includes(tool.name.toLowerCase())) {
          score += 0.4;
        }

        if (tool?.category && lowerQuery.includes(tool.category.toLowerCase())) {
          score += 0.1;
        }

        if (Array.isArray(tool?.keywords)) {
          for (const keyword of tool.keywords) {
            if (lowerQuery.includes(String(keyword).toLowerCase())) {
              score += 0.1;
              break;
            }
          }
        }

        return { tool, score };
      })
      .sort((a, b) => b.score - a.score);
  }
}
