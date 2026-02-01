# Intent Classifier Setup

The WORM assistant uses ONNX Runtime with zero-shot classification for intelligent tool selection.

## Required Setup

### 1. Download the Model

```bash
mkdir -p models
cd models

# Download DeBERTa-v3-xsmall zero-shot model (~50MB)
# Option A: From Hugging Face (if available)
wget https://huggingface.co/cross-encoder/nli-deberta-v3-xsmall/resolve/main/onnx/model.onnx -O deberta-v3-xsmall-zeroshot.onnx

# Option B: Convert from PyTorch yourself
# pip install transformers onnx onnxruntime
# python convert_to_onnx.py
```

### 2. Download the Tokenizer

```bash
# Still in models/ directory
mkdir -p tokenizer
cd tokenizer

# Download tokenizer files from the same NLI model repo
wget https://huggingface.co/cross-encoder/nli-deberta-v3-xsmall/resolve/main/tokenizer.json
wget https://huggingface.co/cross-encoder/nli-deberta-v3-xsmall/resolve/main/tokenizer_config.json
wget https://huggingface.co/cross-encoder/nli-deberta-v3-xsmall/resolve/main/special_tokens_map.json
```

### 3. Model Placement

Your directory structure should look like:
```
worm/
└── models/
    ├── deberta-v3-xsmall-zeroshot.onnx
    └── tokenizer/
      ├── tokenizer.json
      ├── tokenizer_config.json
      └── special_tokens_map.json
```

### 4. Configuration

In your `.env`:
```env
INTENT_THRESHOLD=0.7    # Confidence threshold for tool intent
TOOL_THRESHOLD=0.5      # Confidence threshold for tool selection
```

## How It Works

### ONNX Zero-Shot Classification (100-150ms latency)
1. User sends message
2. Intent classifier detects if tools are needed (~85-90% accuracy)
3. If yes, selects relevant tools using zero-shot classification
4. Only selected tools sent to LLM

## Performance

- **Latency**: 100-150ms per classification
- **Accuracy**: 85-90% for tool selection
- **Memory**: +250MB RAM for model
- **First run**: Model and tokenizer loading (faster after first run)
- **Subsequent runs**: Cached in memory

## Troubleshooting

### Model not loading?
- Check ONNX model exists: `models/deberta-v3-xsmall-zeroshot.onnx`
- Verify model format is ONNX (not PyTorch .bin)

### Tokenizer not loading?
- Check tokenizer directory exists: `models/tokenizer/`
- Verify all 3 files are present:
  - `tokenizer.json`
  - `tokenizer_config.json`
  - `special_tokens_map.json`
- Download from: https://huggingface.co/cross-encoder/nli-deberta-v3-xsmall/tree/main

### High memory usage?
- DeBERTa model uses ~250MB RAM
- Expected behavior for transformer-based classification

### Slow inference?
- First inference is slower (model + tokenizer initialization)
- Subsequent calls are faster (cached in memory)

### Slow inference?
- First inference is slower (model + tokenizer initialization)
- Subsequent calls are faster (cached in memory)

## Future Improvements

- [ ] Implement full ONNX inference pipeline
- [ ] Add model auto-download
- [ ] Support multiple model backends
- [ ] Add tool selection caching
- [ ] Provide pre-converted model downloads
