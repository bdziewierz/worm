import { AutoTokenizer, env } from '@xenova/transformers';
import { fileURLToPath } from 'url';
import { basename, dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * IntentClassifier using ONNX Runtime with zero-shot classification
 * Uses DeBERTa-v3-xsmall for semantic understanding without training
 */
export class IntentClassifier {
  constructor(config = {}) {
    this.session = null;
    this.tokenizer = null;
    this.ort = null;
    this.modelPath = config.modelPath || join(__dirname, '../../models/deberta-v3-xsmall-zeroshot.onnx');
    this.tokenizerPath = config.tokenizerPath || join(__dirname, '../../models/tokenizer');
    this.intentThreshold = config.intentThreshold || 0.7;
    this.toolThreshold = config.toolThreshold || 0.5;
  }

  async load() {
    try {
      // Force CPU-only execution because some macOS builds auto-select CoreML/WebGPU
      // and can crash with "Specified device is not supported". We disable those
      // backends before loading ORT to keep inference stable and consistent.
      if (!process.env.ORT_DISABLE_COREML) {
        process.env.ORT_DISABLE_COREML = '1';
      }
      if (!process.env.ORT_DISABLE_WEBGPU) {
        process.env.ORT_DISABLE_WEBGPU = '1';
      }
      if (!this.ort) {
        this.ort = await import('onnxruntime-node');
      }
      const ort = this.ort;

      // Load ONNX model
      this.session = await ort.InferenceSession.create(this.modelPath, {
        executionProviders: ['cpu']
      });

      // Load tokenizer from local directory (no auto-download)
      const tokenizerId = basename(this.tokenizerPath);
      env.allowRemoteModels = false;
      env.localModelPath = dirname(this.tokenizerPath);
      this.tokenizer = await AutoTokenizer.from_pretrained(tokenizerId, {
        local_files_only: true
      });

      console.log('✓ Intent classifier loaded');
    } catch (error) {
      console.error(`✗ Failed to load intent classifier: ${error.message}`);
      console.error('Download model and tokenizer following INTENT_CLASSIFIER.md instructions');
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
   * Zero-shot classification using ONNX model with NLI (Natural Language Inference)
   */
  async _classify(text, labels, options = {}) {
    if (!this.session || !this.tokenizer || !this.ort) {
      throw new Error('ONNX model or tokenizer not loaded');
    }
    const ort = this.ort;

    const scores = [];

    // For each label, create a hypothesis and run NLI classification
    for (const label of labels) {
      // NLI: premise = user text, hypothesis = label description
      const premise = text;
      const hypothesis = label;

      // Tokenize premise-hypothesis pair
      const encoded = await this.tokenizer(premise, hypothesis, {
        padding: true,
        truncation: true,
        max_length: 512,
        return_tensors: 'pt'
      });

      // Convert to ONNX tensors
      const inputIds = new ort.Tensor('int64', encoded.input_ids.data, encoded.input_ids.dims);
      const attentionMask = new ort.Tensor('int64', encoded.attention_mask.data, encoded.attention_mask.dims);

      // Run inference
      const feeds = {
        input_ids: inputIds,
        attention_mask: attentionMask
      };

      const output = await this.session.run(feeds);

      // Get logits and apply softmax for entailment score
      // DeBERTa NLI models output 3 classes: [contradiction, neutral, entailment]
      const logits = output.logits.data;
      const entailmentScore = this._softmax(logits)[2]; // Index 2 is entailment

      scores.push(entailmentScore);
    }

    return { scores, labels };
  }

  /**
   * Apply softmax to convert logits to probabilities
   */
  _softmax(logits) {
    const maxLogit = Math.max(...logits);
    const exps = logits.map(l => Math.exp(l - maxLogit));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    return exps.map(e => e / sumExps);
  }
}
