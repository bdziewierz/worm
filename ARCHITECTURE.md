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

### 5. **Component Decoupling and Self-Containment** ⚠️ IMPORTANT

**Tools:**

- Each tool is **completely self-contained** in its own file
- Tool metadata (name, description, category, keywords, parameters, execute) lives with the tool
- **No centralized metadata** - avoid coupling tools through shared configuration files
- `tools/index.js` only imports and registers tools, does not define tool behavior
- Only runtime configuration (core status) comes from environment (.env)
- **Principle**: Tools should be copy-pasteable between projects without dependencies

**Clients:**

- Each client is **completely self-contained** in its own file
- Client classes handle their own connection logic, state management, and API surface
- **No clients/index.js registry** - clients are imported directly where needed
- Configuration passed via constructor (dependency injection pattern)
- No shared client configuration or base classes
- **Principle**: Clients are independent modules, add/remove without affecting others

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
│   ├── lib/
│   │   └── toolCaller.js     # Custom 3-stage tool calling system
│   ├── clients/              # Self-contained client modules (no index.js)
│   │   ├── ollama.js         # Ollama LLM client wrapper
│   │   └── matrix.js         # Matrix chat client wrapper
│   └── tools/                # Self-contained tool modules
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
- Build system prompts with user context
- Delegate to ToolCaller for tool-based interactions
- Handle direct LLM chat when no tools registered

**Key Design Decisions:**

- Maintains conversation history (configurable via MAX_HISTORY, default 5) for context
  - **Rationale**: Limit kept low for consumer-grade hardware (4K-8K effective context)
  - Prevents context overflow on Gemma 3 27B / Qwen 3 32B at Q4 quantization
  - Hardware (VRAM) limits KV cache, not model architecture
- System prompt is generated per-message with current timestamp and sender info
  - **Constraint**: Must be concise to preserve context for conversation
  - Includes: agent name, personality, current time, sender's Matrix user ID
- ToolCaller handles all tool execution internally (3-stage flow)
  - Agent just passes messages and tools, receives final response
  - No tool result management needed in Agent

**Conversation Flow:**

1. User message → Add to history
2. Build system prompt with user context (name, personality, timestamp, sender)
3. If tools registered → Delegate to ToolCaller (3-stage flow)
4. If no tools → Direct ollama.chat() call
5. Add assistant response to history
6. Return response to user

**ToolCaller Integration:**

- Agent passes messages + tools to ToolCaller.run()
- ToolCaller handles stages 1-3 internally
- Agent receives final text response
- System prompt is included in messages array for all stages

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

### 4. Intent Classifier (`src/agent/intentClassifier.js`)

**Purpose:**

The Intent Classifier is a **critical performance optimization** for consumer-grade hardware:

**Problem:** Sending all tool schemas to the LLM wastes ~1000 tokens per request:

- 20 tools × 50 tokens each = 1000 tokens consumed
- With 4K-8K effective context, this leaves only 3K-7K for conversation history
- LLM must parse irrelevant tools on every request (processing overhead)

**Solution:** Preselect 2-3 relevant tools using intent classification:

- Reduces tool schemas to ~100-200 tokens (80-90% savings)
- LLM only sees tools relevant to user's intent
- Frees context window for longer conversation history

**Three-Tier Selection Strategy:**

1. **Explicit Prefixes** (instant, 100% accuracy)
   - `CALC: 25 * 4` → instantly loads calculate tool
   - `WEATHER: London` → instantly loads weather tool
   - No classification needed, zero latency

2. **Intent Classification** (100-150ms, 85-90% accuracy)
   - Zero-shot classification using DeBERTa-v3-xsmall ONNX model
   - Semantic understanding of user intent
   - Requires ONNX model download (see INTENT_CLASSIFIER.md)

3. **Keyword Fallback** (instant)
   - Used if intent classification fails or returns no matches
   - Matches keywords in tool definitions
   - Last resort to ensure tool availability

**Configuration:**

- `INTENT_THRESHOLD=0.7` - Confidence threshold for tool intent detection
- `TOOL_THRESHOLD=0.5` - Confidence threshold for individual tool selection
- `CORE_TOOLS=tool1,tool2` - Always-loaded tools (bypass classification)

**Design:**

- Intent classification is **required** for optimal context window usage
- ONNX model with DeBERTa-v3-xsmall for zero-shot classification
- @xenova/transformers for tokenization
- Application starts normally - will load tokenizer on first classification (~10-20MB download)

### 5. Tools (`src/tools/*.js`)

**Tool Structure:**
Each tool must export an object with:

```javascript
{
  name: string,           // Unique identifier
  description: string,    // What the tool does (LLM sees this)
  category: string,       // Category for prefix matching (e.g., 'time', 'math', 'weather')
  keywords: string[],     // Keywords for automatic detection (e.g., ['time', 'clock'])
  parameters: object,     // JSON Schema for arguments
  execute: async (args) => result  // Implementation
}
```

**Design Constraints:**

- Tools must be async functions (even if synchronous internally)
- Tools must handle their own errors and return error objects
- Tool results should be JSON-serializable
- Tools are stateless (no internal state between calls)
- **Tools are self-contained** - all metadata defined in the tool file itself
- Only `core` status is enriched at runtime from environment configuration

**Current Tools:**

- `get_current_time` - Date/time with timezone support
- `calculate` - Safe mathematical expression evaluation
- `get_weather` - Mock weather tool (placeholder for real API)

**Adding New Tools:**

1. Create tool file in `src/tools/` with complete definition (name, description, category, keywords, parameters, execute)
2. Import tool in `src/tools/index.js` and add to array
3. Optionally add to `CORE_TOOLS` in `.env` if it should always load
4. Tool is automatically available to agent with selective loading support

### New Tool Ideas

Tools that fit consumer-grade hardware constraints (compact outputs, stateless, <200 token results):

**Time & Scheduling**

- `set_reminder` - Create time-based reminders (store in SQLite, return confirmation)
- `list_reminders` - Show upcoming reminders (return compact list)
- `convert_timezone` - Convert times between zones (return single result)
- `countdown` - Calculate time until date/event (return duration)

**Information Retrieval**

- `search_web` - DuckDuckGo search (return top 3 results, titles + snippets only)
- `get_definition` - Word definitions (return concise definition)
- `get_exchange_rate` - Currency conversion (return single rate)
- `get_crypto_price` - Crypto prices (return current price only, no history)
- `ip_lookup` - Get info about IP address (return location summary)

**System Interaction**

- `run_shell_command` - Execute safe shell commands (whitelist only, limit output to 500 chars)
- `get_system_info` - CPU/RAM/disk usage (return compact stats)
- `list_processes` - Show running processes (return top 10 by CPU/memory)
- `check_port` - Check if port is open (return boolean + service name)

**File Operations**

- `read_file` - Read file contents (limit to 1000 chars, or return excerpt)
- `write_file` - Write/append to file (return success confirmation)
- `list_directory` - List files in directory (return names only, no metadata)
- `file_info` - Get file size/modified date (return compact stats)
- `search_files` - Find files by name pattern (return paths only, limit 20 results)

**Communication**

- `send_email` - Send email via SMTP (return success/failure)
- `send_sms` - Send SMS via API (return delivery status)
- `post_webhook` - POST to webhook URL (return HTTP status)

**Note & Task Management**

- `save_note` - Save note to database (return note ID)
- `search_notes` - Search saved notes (return titles/IDs, not full content)
- `create_todo` - Add todo item (return item ID)
- `list_todos` - Show incomplete todos (return compact list, max 10)
- `complete_todo` - Mark todo done (return confirmation)

**Data Manipulation**

- `encode_base64` - Encode string to base64 (return encoded)
- `decode_base64` - Decode base64 string (return decoded)
- `hash_string` - Generate hash (MD5/SHA256) of string (return hash)
- `json_query` - Query JSON with JSONPath (return matching values)
- `url_encode` - URL encode string (return encoded)

**Utilities**

- `generate_uuid` - Create UUID (return UUID string)
- `generate_password` - Generate secure password (return password)
- `qr_code` - Generate QR code (return data URL or save to file)
- `shorten_url` - Shorten URL via service (return short URL)
- `validate_email` - Check email format validity (return boolean)

**Context-Aware Personal Assistant**

- `remember_fact` - Store user preference/fact (return confirmation)
- `recall_fact` - Retrieve stored fact by key (return value only)
- `get_location` - Get user's location (return city/country, not full address)
- `translate_text` - Translate text (return translation only, no metadata)

**Design Principles for These Tools:**

1. **Compact Results**: All tools return <200 tokens
2. **No Streaming**: Complete results, not large datasets
3. **Error Resilient**: Always return something, even on failure
4. **Fast Execution**: Complete in <2 seconds to avoid timeout
5. **Stateless**: No persistent state between calls (except database-backed tools)
6. **Safe**: Input validation, no arbitrary code execution
7. **Focused**: Single purpose, not multi-function tools

**Tools to AVOID (context window problems):**

- ❌ `read_large_file` - Outputs too large
- ❌ `analyze_code` - Results too verbose
- ❌ `summarize_document` - Input + output too large
- ❌ `browse_webpage` - Full HTML too large
- ❌ `list_all_files_recursive` - Output grows unbounded
- ❌ `get_api_docs` - Documentation too verbose
- ❌ `debug_error` - Stack traces and context too large

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
- Are **self-contained** in their own files (no shared configuration)
- Accept configuration via constructor (dependency injection)
- Can be added/removed without affecting other clients

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
        description: 'What this argument does',
      },
    },
    required: ['arg1'],
  },
  execute: async args => {
    try {
      // Implementation
      return { success: true, result: 'data' };
    } catch (error) {
      return { error: error.message };
    }
  },
};
```

Then add to `src/tools/index.js`:

```javascript
import { myTool } from './myTool.js';

export function getTools() {
  return [
    // existing tools...
    myTool,
  ];
}
```

### Adding a New Client

If integrating another service:

1. Create **self-contained** client class in `src/clients/newService.js`
   - Include all service-specific logic in this one file
   - Accept configuration via constructor
   - No dependencies on other clients
2. Implement connection lifecycle methods (`connect()`, `disconnect()`)
3. Implement service-specific methods (your API surface)
4. Export class for direct import in `src/index.js`
5. Add required environment variables to `.env.example`
6. Initialize client in `src/index.js` with configuration
7. **Do NOT create** `clients/index.js` - import clients directly where needed

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
