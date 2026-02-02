import { calculateTool } from './calculate.js';
import { weatherTool } from './weather.js';
import { searchTool } from './search.js';
import { convertTool } from './convert.js';
import { uuidTool } from './uuid.js';
import { cryptoPriceTool } from './cryptoPrice.js';
import { encodeTool } from './encode.js';
import { randomTool } from './random.js';
import { hashTool } from './hash.js';
import { timezoneTool } from './timezone.js';
import { passwordTool } from './password.js';
import { textAnalyzerTool } from './textLengthAnalyzer.js';
import { jsonTool } from './json.js';
import { colorTool } from './color.js';
import { loremTool } from './lorem.js';
import { distanceTool } from './distance.js';

// Parse core tools from environment (comma-separated list)
function getCoreToolNames() {
  const coreToolsEnv = process.env.CORE_TOOLS || '';
  if (!coreToolsEnv.trim()) {
    return [];
  }
  return coreToolsEnv
    .split(',')
    .map(name => name.trim())
    .filter(name => name.length > 0);
}

export function getTools() {
  const tools = [
    calculateTool,
    weatherTool,
    searchTool,
    convertTool,
    uuidTool,
    cryptoPriceTool,
    encodeTool,
    randomTool,
    hashTool,
    timezoneTool,
    passwordTool,
    textAnalyzerTool,
    jsonTool,
    colorTool,
    loremTool,
    distanceTool,
  ];

  const coreToolNames = getCoreToolNames();

  // Enrich tools with core status from environment configuration
  return tools.map(tool => ({
    ...tool,
    core: coreToolNames.includes(tool.name),
  }));
}
