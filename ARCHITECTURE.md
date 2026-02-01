# WORM Assistant - Architecture & Design

This document outlines the architectural decisions, design patterns, and key assumptions for the WORM Personal Assistant project. Follow these guidelines to maintain consistency and prevent architectural drift.

## Project Overview

WORM is a personal AI assistant application that:
- Runs as a command-line Node.js application
- Uses remote Ollama for LLM capabilities with function calling
- Integrates with Matrix protocol for user communication
- Executes tools based on user requests via an agent system

## Architectural Principles

### 1. **Lightweight Agent Design** ⚠️ CRITICAL
The agent is designed to run on **consumer-grade hardware** with limited context windows:
- **Target Models**: Gemma 3 27B, Qwen 3 32B (27-32 billion parameter models)
- **Hardware Target**: 24GB VRAM, 32GB RAM consumer machines
- **Quantization**: Q4 quantization required (~13.5GB for Gemma, ~16GB for Qwen)
- **Realistic Context Window**: 4K-8K tokens (hardware-limited, not model-limited)
  - Model may support larger context theoretically, but VRAM limits KV cache
  - Conservative target: 4K tokens for system + conversation + tools
  - Optimistic: 8K tokens with efficient attention
- **Prompt Constraints**: System prompt + conversation history + tool schemas must fit in 4K-8K tokens
- **History Limit**: 10 messages maximum to preserve context window space
- **Tool Descriptions**: Keep concise - LLM reads all tool schemas on every request
- **System Prompt**: Minimal and focused - generated once, sent with every message

**Design Implications:**
- Avoid verbose tool descriptions
- Keep conversation history small (currently 10 messages)
- Don't accumulate tool results indefinitely
- System prompt must be concise and essential-only
- No complex multi-step reasoning chains that consume context

### 2. **Separation of Concerns**
The application is divided into distinct layers:
- **Entry Point** (`src/index.js`) - Application initialization and orchestration
- **Clients** (`src/clients/`) - External service integrations (Ollama, Matrix)
- **Agent** (`src/agent/`) - Core AI logic and tool orchestration
- **Tools** (`src/tools/`) - Individual tool implementations

### 3. **Stateless Tool Execution**
- Tools are pure functions that receive arguments and return results
- Tools do not maintain internal state between executions
- Each tool is self-contained and independently testable

### 4. **Event-Driven Communication**
- Matrix client uses event listeners for incoming messages
- Handler pattern for message processing
- Non-blocking asynchronous operations throughout

## Technology Stack

### Core Technologies
- **Node.js**: v20.0.0+ (ESM modules, latest features)
- **Runtime**: ESM modules only (no CommonJS)
- **Package Manager**: npm

### Key Dependencies
- **ollama**: Official Ollama JavaScript client for LLM interaction
- **matrix-js-sdk**: Matrix protocol client for chat integration
- **dotenv**: Environment variable management
- **chalk**: Terminal output formatting

### Why These Choices?

#### Ollama (Remote)
- **Assumption**: LLM should be hosted separately from the application
- **Rationale**: Separation allows scaling LLM infrastructure independently
- **Target Models**: Consumer-grade models (Gemma 3 27B, Qwen 3 32B) with hardware-limited context
- **Hardware**: Designed for 24GB VRAM, 32GB RAM machines (requires Q4 quantization)
- **Effective Context**: 4K-8K tokens (VRAM constraint on KV cache, not model limitation)
- **Note**: The client can connect to any Ollama-compatible API endpoint

#### Matrix Protocol
- **Assumption**: Matrix provides secure, decentralized communication
- **Rationale**: End-to-end encryption capable, federated, open protocol
- **Security**: Homeserver-authenticated user IDs prevent spoofing
- **Note**: Users cannot be impersonated; Matrix authentication is cryptographic

#### ESM Modules
- **Assumption**: Modern JavaScript is the standard going forward
- **Rationale**: Better tree-shaking, cleaner imports, native browser compatibility
- **Note**: All imports must use `.js` extensions explicitly

## Directory Structure

```
worm/
├── src/
│   ├── index.js              # Application entry point
│   ├── agent/
│   │   └── agent.js          # Agent orchestration logic
│   ├── clients/
│   │   ├── ollama.js         # Ollama LLM client wrapper
│   │   └── matrix.js         # Matrix chat client wrapper
│   └── tools/
│       ├── index.js          # Tool registry
│       └── *.js              # Individual tool implementations
├── .env.example              # Environment configuration template
├── .env                      # Local configuration (gitignored)
├── package.json              # Dependencies and scripts
├── README.md                 # User-facing documentation
└── ARCHITECTURE.md           # This file
```

## Component Architecture

### 1. Agent (`src/agent/agent.js`)

**Responsibilities:**
- Manage conversation history
- Coordinate LLM interactions
- Execute tool calls requested by the LLM
- Format responses for users

**Key Design Decisions:**
- Maintains conversation history (last 10 messages) for context
  - **Rationale**: Limit kept low for consumer-grade hardware (4K-8K effective context)
  - Prevents context overflow on Gemma 3 27B / Qwen 3 32B at Q4 quantization
  - Hardware (VRAM) limits KV cache, not model architecture
- System prompt is generated once at initialization
  - **Constraint**: Must be concise to preserve context for conversation
  - Target: <500 tokens for system prompt + tool schemas
- Tool results are added to conversation history before final response
  - **Note**: Large tool outputs consume context - keep results compact (<200 tokens each)
- Supports multi-turn tool execution (tool calls can trigger more tool calls)
  - **Warning**: Deep tool chains can exhaust 4K-8K context window quickly

**Conversation Flow:**
1. User message → Add to history
2. Send to Ollama with available tools
3. If tool calls requested → Execute tools → Send results back to Ollama
4. Return final response
5. Add assistant response to history

### 2. Ollama Client (`src/clients/ollama.js`)

**Responsibilities:**
- Manage connection to remote Ollama server
- Provide chat interface with tool calling support
- Handle model validation

**Key Design Decisions:**
- Connection is validated on startup
- Model name is configurable via environment
- Supports both `chat` (with tools) and `generate` (simple prompts)
- Streaming is disabled for predictable response handling

**API Surface:**
- `testConnection()` - Verify Ollama availability and model presence
- `chat(messages, tools)` - Main LLM interaction with tool support
- `generate(prompt, options)` - Simple text generation

### 3. Matrix Client (`src/clients/matrix.js`)

**Responsibilities:**
- Connect to Matrix homeserver
- Listen for and filter messages
- Send responses to configured room
- Enforce user access control

**Key Design Decisions:**
- Only processes messages from configured room
- Ignores messages older than 5 seconds (prevents processing backlog on startup)
- Ignores bot's own messages
- User allowlist is enforced at message reception (early rejection)
- Multiple message handlers supported (extensibility)

**Security Assumptions:**
- `event.getSender()` returns authenticated Matrix user ID
- Matrix homeserver validates all message signatures
- User IDs cannot be spoofed due to cryptographic authentication
- Access token is kept secret and provides full account access

**Message Filtering:**
1. Room ID check (only configured room)
2. Message type check (only text messages)
3. Self-message check (ignore bot's messages)
4. User allowlist check (security enforcement)
5. Timestamp check (ignore old messages)
6. Forward to registered handlers

### 4. Tools (`src/tools/*.js`)

**Tool Structure:**
Each tool must export an object with:
```javascript
{
  name: string,           // Unique identifier
  description: string,    // What the tool does (LLM sees this)
  parameters: object,     // JSON Schema for arguments
  execute: async (args) => result  // Implementation
}
```

**Design Constraints:**
- Tools must be async functions (even if synchronous internally)
- Tools must handle their own errors and return error objects
- Tool results should be JSON-serializable
- Tools are stateless (no internal state between calls)

**Current Tools:**
- `get_current_time` - Date/time with timezone support
- `calculate` - Safe mathematical expression evaluation
- `get_weather` - Mock weather tool (placeholder for real API)

**Adding New Tools:**
1. Create tool file in `src/tools/`
2. Export tool object with required structure
3. Import and add to array in `src/tools/index.js`
4. Tool is automatically available to agent

## Configuration Management

### Environment Variables

**Required Variables:**
- `OLLAMA_BASE_URL` - Remote Ollama server URL
- `OLLAMA_MODEL` - Model name (must exist on server)
- `MATRIX_HOMESERVER` - Matrix server URL
- `MATRIX_USER_ID` - Bot's Matrix user ID
- `MATRIX_ACCESS_TOKEN` - Bot's authentication token
- `MATRIX_ROOM_ID` - Room to monitor for messages

**Optional Variables:**
- `MATRIX_ALLOWED_USERS` - Comma-separated user IDs (empty = allow all)
- `ASSISTANT_NAME` - Display name for assistant

**Configuration Loading:**
- Loaded via `dotenv` at application start
- Validation happens in `src/index.js` before client initialization
- Missing required variables cause immediate exit with clear error

## Security Model

### Threat Model

**Protected Against:**
- Unauthorized Matrix users (allowlist system)
- User spoofing (Matrix protocol guarantees)
- Malicious expressions in calculator (regex validation, Function constructor)
- Accidental exposure of credentials (.gitignore, .env.example)

**Not Protected Against:**
- Authorized users executing malicious tool calls
- Server-side vulnerabilities in Ollama or Matrix homeserver
- Compromise of .env file on filesystem
- Social engineering of authorized users

### Security Layers

1. **Matrix Authentication** - Homeserver validates all users
2. **User Allowlist** - Application-level access control
3. **Tool Input Validation** - Each tool validates its inputs
4. **Environment Isolation** - Secrets in .env, never in code

## Design Patterns

### 1. **Client Pattern**
Wrap external services (Ollama, Matrix) in client classes that:
- Handle connection lifecycle
- Provide simplified API to rest of application
- Manage service-specific error handling

### 2. **Registry Pattern**
Tools are registered in a central location (`src/tools/index.js`) that:
- Provides single source of truth for available tools
- Makes tools discoverable by agent
- Simplifies adding/removing tools

### 3. **Handler Pattern**
Event handling via callbacks:
- Matrix client accepts message handlers
- Handlers are called for each valid message
- Multiple handlers can be registered (future extensibility)

### 4. **Async/Await**
All I/O operations use async/await:
- No callback pyramids
- Consistent error handling via try/catch
- Readable sequential flow

## Extending the Application

### Adding a New Tool

```javascript
// src/tools/myTool.js
export const myTool = {
  name: 'my_tool_name',
  description: 'Clear description for the LLM',
  parameters: {
    type: 'object',
    properties: {
      arg1: {
        type: 'string',
        description: 'What this argument does'
      }
    },
    required: ['arg1']
  },
  execute: async (args) => {
    try {
      // Implementation
      return { success: true, result: 'data' };
    } catch (error) {
      return { error: error.message };
    }
  }
};
```

Then add to `src/tools/index.js`:
```javascript
import { myTool } from './myTool.js';

export function getTools() {
  return [
    // existing tools...
    myTool
  ];
}
```

### Adding a New Client

If integrating another service:
1. Create client class in `src/clients/newService.js`
2. Implement `connect()` and service-specific methods
3. Export class for use in `src/index.js`
4. Add configuration to `.env.example`
5. Initialize in `src/index.js`

### Modifying Agent Behavior

**System Prompt:** Edit `_buildSystemPrompt()` in `src/agent/agent.js`
**Conversation History:** Adjust limit in `processMessage()`
**Tool Calling Logic:** Modify `_handleToolCalls()`

## Testing Considerations

### Current State
- No automated tests currently implemented
- Manual testing via Matrix chat

### Future Testing Strategy
- **Unit Tests**: Individual tool execution
- **Integration Tests**: Agent with mock Ollama/Matrix
- **E2E Tests**: Full flow with test Matrix room

### Test Principles
- Tools should be easiest to test (pure functions)
- Clients should use dependency injection for mocking
- Agent logic should be testable with mock clients

## Performance Considerations

### Current Optimizations
- Conversation history limited to 10 messages
  - **Primary Purpose**: Context window management for consumer-grade hardware
  - **Target**: Gemma 3 27B, Qwen 3 32B at Q4 quantization (4K-8K effective context)
  - **Hardware Constraint**: 24GB VRAM limits KV cache size, not model capability
  - **Secondary**: Memory management in Node.js
- Old messages ignored (prevents backlog processing)
- Streaming disabled (simpler implementation, predictable timing)
- Concise tool descriptions (LLM reads all tool schemas on every request)

### Scaling Limitations
- Single-threaded Node.js (one conversation at a time)
- All state in memory (no persistence)
- Synchronous tool execution (no parallel tool calls)

### Future Improvements
- Implement conversation history persistence
- Add parallel tool execution
- Consider worker threads for CPU-intensive tools
- Add rate limiting for tool execution

## Migration Path

### From v1.0.0 to Future Versions

**Breaking Changes to Avoid:**
- Tool interface contract (name, description, parameters, execute)
- Environment variable names (add new, don't rename)
- Client constructors (maintain backward compatibility)

**Safe Changes:**
- Adding new tools
- Adding new optional environment variables
- Adding new client methods
- Extending system prompt

## Maintenance Guidelines

### Code Style
- Use ESM imports with `.js` extensions
- Prefer `async/await` over promises
- Use `const` by default, `let` when reassignment needed
- No `var`
- Meaningful variable names over comments

### Error Handling
- Try/catch in client methods
- Return error objects from tools (don't throw)
- Log errors before propagating
- Graceful degradation where possible

### Logging
- Use `chalk` for colored console output
- Emoji prefixes for log categories (🤖 assistant, 📨 message, ❌ error, etc.)
- Include context in error messages
- Don't log sensitive data (tokens, access tokens)

## Future Architecture Considerations

### Potential Enhancements
- **Persistence Layer**: Database for conversation history
- **Multi-Room Support**: Monitor multiple Matrix rooms
- **Tool Marketplace**: Dynamic tool loading
- **Conversation Context**: Per-user conversation isolation
- **Streaming Responses**: Real-time response delivery
- **Tool Composition**: Tools that call other tools
- **Admin Commands**: Special commands for bot management

### Architectural Decisions to Make Later
- Should we support multiple LLM providers?
- Should tools be sandboxed (containers, VMs)?
- Should we add a plugin system?
- Should we support other chat protocols (Slack, Discord)?

## Assumptions and Constraints

### Core Assumptions
1. **Lightweight Agent**: Designed for consumer-grade models (Gemma 3 27B, Qwen 3 32B at Q4) on 24GB VRAM / 32GB RAM machines
2. **Limited Context Window**: All prompts must fit in 4K-8K token context (hardware VRAM constraint, not model limitation)
3. **Single User Per Session**: Agent maintains one conversation history
4. **Trust in Tools**: Tools are trusted code running with full application privileges
5. **Remote LLM**: Ollama runs on a separate, accessible server
6. **Network Reliability**: Stable connection to Ollama and Matrix homeserver
7. **Matrix Security**: Homeserver authentication is sufficient for user verification
8. **Synchronous Tools**: Tools execute sequentially, not in parallel

### Known Limitations
1. No conversation persistence (lost on restart)
2. No multi-user conversation isolation
3. No rate limiting on tool execution
4. No tool execution sandboxing
5. No audit logging of tool executions

---

**Last Updated:** February 1, 2026
**Version:** 1.0.0
**Maintainers:** See package.json
