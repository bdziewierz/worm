import * as ort from 'onnxruntime-node';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * IntentClassifier using ONNX Runtime with zero-shot classification
 * Uses DeBERTa-v3-xsmall for semantic understanding without training
 */
export class IntentClassifier {
  constructor(config = {}) {
    this.session = null;
    this.modelPath = config.modelPath || join(__dirname, '../../models/deberta-v3-xsmall-zeroshot.onnx');
    this.intentThreshold = config.intentThreshold || 0.7;
    this.toolThreshold = config.toolThreshold || 0.5;
  }

  async load() {
    try {
      // Load ONNX model
      this.session = await ort.InferenceSession.create(this.modelPath);
      console.log('✓ Intent classifier loaded');
    } catch (error) {
      console.error(`✗ Failed to load intent classifier: ${error.message}`);
      console.error('Download model following INTENT_CLASSIFIER.md instructions');
      throw error;
    }
  }

  /**
   * Detect if user message indicates intent to use tools
   */
  async detectToolIntent(text) {
    const labels = [
      'user wants to use a tool, get information, or perform an action',
      'user is just chatting, telling a story, or asking about capabilities'
    ];

    const result = await this._classify(text, labels);
    return result.scores[0] > this.intentThreshold;
  }

  /**
   * Select which tools are relevant for the user message
   */
  async selectTools(text, availableTools) {
    // Create natural language labels from tool metadata
    const labels = availableTools.map(tool => 
      `${tool.category} tools: ${tool.description}`
    );

    const result = await this._classify(text, labels, { multiLabel: true });

    // Return tools above threshold
    const selectedTools = [];
    result.scores.forEach((score, index) => {
      if (score > this.toolThreshold) {
        selectedTools.push(availableTools[index]);
      }
    });

    return selectedTools;
  }

  /**
   * Zero-shot classification using ONNX model
   */
  async _classify(text, labels, options = {}) {
    // This is a placeholder for the actual ONNX inference
    // Implementation depends on the specific model format
    throw new Error('ONNX classification not yet implemented');
  }
}
