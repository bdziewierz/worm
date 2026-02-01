import { getCurrentTimeTool } from './getCurrentTime.js';
import { calculateTool } from './calculate.js';
import { weatherTool } from './weather.js';

// Parse core tools from environment (comma-separated list)
function getCoreToolNames() {
  const coreToolsEnv = process.env.CORE_TOOLS || '';
  if (!coreToolsEnv.trim()) {
    // Default fallback if not configured
    return ['get_current_time', 'calculate'];
  }
  return coreToolsEnv.split(',').map(name => name.trim()).filter(name => name.length > 0);
}

export function getTools() {
  const tools = [
    getCurrentTimeTool,
    calculateTool,
    weatherTool
  ];

  const coreToolNames = getCoreToolNames();

  // Enrich tools with core status from environment configuration
  return tools.map(tool => ({
    ...tool,
    core: coreToolNames.includes(tool.name)
  }));
}
