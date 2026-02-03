# WORM Assistant - Roadmap

This document outlines planned features and improvements for the WORM personal assistant project.

## Current Status

✅ **Core Features Complete:**

- Provider-agnostic LLM integration (Ollama + cloud APIs) with custom 3-stage tool calling
- Matrix chat client with message handling
- Security (user and room allowlists)
- LLM-based tool routing with aggressive token optimization for tight context windows
- Basic tools (calculator, weather)
- Consumer hardware optimization (4K-8K context)
- Performance monitoring (token counts, timing per stage)

## High Priority

### Encryption Support

**Status:** Not implemented
**Priority:** High
**Description:** Add Matrix E2EE (End-to-End Encryption) support to allow bot operation in encrypted rooms.

**Requirements:**

- Set up crypto store (memory or file-based)
- Handle device verification
- Implement key management
- Handle encrypted message events (`m.room.encrypted`)
- Decrypt incoming messages
- Encrypt outgoing messages

**Technical Notes:**

- matrix-js-sdk provides crypto support via `MatrixClient.initCrypto()`
- Requires storage for encryption keys (consider SQLite for persistence)
- Device verification workflow needed for initial setup
- May increase memory footprint (consider hardware constraints)

**References:**

- https://matrix.org/docs/guides/end-to-end-encryption-implementation-guide
- matrix-js-sdk crypto documentation

## Medium Priority

### Tool Expansion

- File operations (read, write, list)
- System monitoring (CPU, RAM, disk usage)
- Web search integration (DuckDuckGo API)
- Currency/crypto price lookups
- Reminder/scheduling system with persistence

### Tool Calling Improvements

- Retry logic for malformed JSON responses
- Parallel tool execution when tools are independent
- Tool result caching for repeated calls
- Streaming support for long-running tools

### Conversation Management

- Conversation summarization for long threads
- Context pruning strategies
- Multiple conversation threads per user
- Conversation export/import

## Low Priority

### Developer Experience

- Unit tests for tools and clients
- Integration tests for Matrix and Ollama
- Docker containerization
- CI/CD pipeline
- Development mode with hot reload

### User Experience

- Rich message formatting (markdown, HTML)
- Reaction-based interactions
- Multi-language support
- Custom tool aliases/shortcuts
- User preferences storage

### Performance Optimization

- Connection pooling for Ollama
- Response streaming for long outputs
- Tool result caching
- Batch tool execution

## Future Considerations

### Provider Enhancements

- Additional enterprise providers (Azure OpenAI, Vertex AI hosted Gemini)
- Provider-specific safety/latency tuning
- Local LLM optimizations (llama.cpp, vLLM) beyond current abstraction

### Multi-Platform Support

- Slack integration
- Discord bot
- Telegram bot
- REST API for custom clients

### Advanced Features

- Memory/knowledge base (RAG)
- Custom tool marketplace
- Plugin system for extensions
- Multi-agent collaboration
- Voice interaction support

## Contributing

See individual issues for detailed implementation plans. Feel free to contribute to any of these roadmap items!

## Architecture Constraints

All features must respect the lightweight agent design:

- **Context Window:** 4K-8K tokens maximum
- **Hardware Target:** 24GB VRAM, 32GB RAM
- **Model Target:** Gemma 3 27B, Qwen 3 32B @ Q4 quantization
- Keep system prompts concise (<500 tokens)
- Optimize tool descriptions (<50 tokens each)
- Maintain fast response times (<2s for most operations)
