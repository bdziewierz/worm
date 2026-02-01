import { getCurrentTimeTool } from './getCurrentTime.js';
import { calculateTool } from './calculate.js';
import { weatherTool } from './weather.js';

export function getTools() {
  return [
    getCurrentTimeTool,
    calculateTool,
    weatherTool
  ];
}
