import { BaselineReasoner } from './baselineReasoner.js';
import { ReactReasoner } from './reactReasoner.js';

const registry = {
  baseline: BaselineReasoner,
  react: ReactReasoner,
};

export function createReasoner(mode, options) {
  const normalized =
    typeof mode === 'string' && mode.trim() ? mode.trim().toLowerCase() : 'baseline';
  const Reasoner = registry[normalized] || BaselineReasoner;
  return new Reasoner(options);
}
