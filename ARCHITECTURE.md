# WORM Assistant - Architecture & Design

This document outlines the architectural decisions, design patterns, and key assumptions for the WORM Personal Assistant project. Follow these guidelines to maintain consistency and prevent architectural drift.

## Project Overview

WORM is a personal AI assistant application that:

- Runs as a command-line Node.js application
- Uses a pluggable LLM provider layer (Ollama, Google Gemini, Mistral)
- Integrates with a messaging dispatcher (Matrix adapter available)
- Executes tools based on user requests via an agent system

## Architectural Principles

### 1. **Lightweight Agent Design** ⚠️ CRITICAL

The agent is designed to run on **consumer-grade hardware** with limited context windows:

- **Target Models**: Gemma 3 27B, Qwen 3 32B (27-32 billion parameter models)
- **Hardware Target**: 24GB VRAM, 32GB RAM consumer machines
- **Quantization**: Q4 quantization required (~13.5GB for Gemma, ~16GB for Qwen)
- **Realistic Context Window**: 4K-8K tokens (hardware-limited, not model-limited)
  - Model may support larger context theoretically, but VRAM limits KV cache
  - Conservative target: keep prompts under 4K tokens; optimistic target 8K with efficient attention
- **Prompt Constraints**: System prompt + conversation history + tool schemas must stay within a configurable budget (`MAX_CONTEXT_TOKENS`)
- **Dynamic Trim Rules**: A token-budget manager automatically drops older turns and extra tool schemas when the prompt would exceed the configured budget
- **Optional History Cap**: `MAX_HISTORY` can still be used to force a hard ceiling on stored turns when desired
- **Tool Descriptions**: Keep concise - LLM reads all tool schemas on every request
- **System Prompt**: Minimal and focused - generated once, sent with every message

**Design Implications:**

- Avoid verbose tool descriptions so they stay within `MAX_TOOL_CONTEXT_TOKENS`
- Let the token budget manager prune history automatically, or lower `MAX_HISTORY` when a fixed cap is required
- Don't accumulate tool results indefinitely
- System prompt must be concise and essential-only
- No complex multi-step reasoning chains that consume context

### 2. **Separation of Concerns**

The application is divided into distinct layers:

- **Entry Point** (`src/index.js`) - Application initialization and orchestration
- **Clients** (`src/clients/`) - External service integrations (Ollama, Matrix)
- **Agents** (`src/agents/`) - Core AI logic and tool orchestration
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

#### Multi-Provider LLM Fabric

- **Assumption**: Different deployments may favor different LLM vendors (self-hosted vs. cloud)
- **Rationale**: A pluggable provider layer allows switching models without touching agent logic
- **Supported Providers**: `ollama`, `gemini`, `mistral`
- **Selection Mechanism**: `.env` variable `LLM_PROVIDER` determines active provider at runtime
- **Configuration Pattern**: Provider-specific env vars (API keys, base URLs, model IDs) remain isolated

#### Ollama (Remote)

- **Assumption**: LLM should be hosted separately from the application
- **Rationale**: Separation allows scaling LLM infrastructure independently
- **Target Models**: Consumer-grade models (Gemma 3 27B, Qwen 3 32B) with hardware-limited context
- **Hardware**: Designed for 24GB VRAM, 32GB RAM machines (requires Q4 quantization)
- **Effective Context**: 4K-8K tokens (VRAM constraint on KV cache, not model limitation)
- **Note**: The client can connect to any Ollama-compatible API endpoint

#### Messaging Providers (Matrix default)

- **Assumption**: Chat transport should be swappable just like the LLM
- **Rationale**: The messaging dispatcher exposes a minimal API (connect, onMessage, sendMessage, setTyping, disconnect) so alternative transports can plug in without touching the agent
- **Current Default**: Matrix remains the first-class implementation due to its federated, secure design
- **Security**: Matrix homeserver-authenticated user IDs prevent spoofing
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
│   ├── agents/
│   │   └── agent.js          # Agent orchestration logic
│   ├── reasoners/            # Pluggable reasoning strategies (baseline, ReAct, ...)
│   ├── lib/
│   │   ├── llmDispatcher.js  # Pluggable LLM provider router
│   │   ├── messagingDispatcher.js # Messaging provider router
│   │   └── toolCaller.js     # Semantic tool selection + tool calling
│   ├── clients/              # Self-contained client modules (no index.js)
│   │   ├── llm/              # Individual LLM clients
│   │   │   ├── gemini.js
│   │   │   ├── mistral.js
│   │   │   └── ollama.js
│   │   └── messaging/
│   │       └── matrix.js
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

### 1. Agent (`src/agents/agent.js`)

**Responsibilities:**

- Manage conversation history
- Build system prompts with user context
- Delegate to ToolCaller for tool-based interactions
- Handle direct LLM chat when no tools registered

- **Key Design Decisions:**

- Maintains conversation history with an optional `MAX_HISTORY` cap, then relies on the token budget manager to drop the oldest turns when necessary
  - **Rationale**: Keep prompts within user-defined budgets tailored to 4K–8K effective contexts
  - `MAX_CONTEXT_TOKENS` plus `RESPONSE_TOKEN_BUFFER` guarantee the model always has reply headroom
- System prompt is generated per-message with current timestamp and sender info
  - **Constraint**: Must be concise to preserve context for conversation
  - Includes: agent name, personality, current time, sender's Matrix user ID
- TokenBudgetManager estimates prompt size using a lightweight heuristic and enforces the configured budgets before delegating to the LLM
- Per-user HistoryStore persists conversation logs under `memory/history/`, keyed by user ID (hashed) so each Matrix user and cron job owner keeps isolated context that survives restarts
- ToolCaller selects a small tool subset via semantic search, then handles tool execution
  - Agent just passes messages and tools, receives final response
  - No tool result management needed in Agent

**Conversation Flow:**

1. User message → Load that user’s history from disk, append the new turn, and scope all following steps to that user only
2. Build system prompt with user context (name, personality, timestamp, sender)
3. TokenBudgetManager trims history/tool payloads to stay within `MAX_CONTEXT_TOKENS - RESPONSE_TOKEN_BUFFER`, then the trimmed result overwrites the persisted history for that user
4. If tools registered → Delegate to ToolCaller (semantic selection + tool calling)
5. If no tools → Direct llm.chat() call
6. Add assistant response to history
7. Return response to user

**ToolCaller Integration:**

- Agent passes messages + tools to ToolCaller.run()
- ToolCaller selects up to 3 tools and orchestrates tool calls internally
- Agent receives final text response
- System prompt is included in messages array for all stages

### Reasoning Plugins (`src/reasoners/`)

- Agent delegates execution to a reasoning plugin so multi-stage orchestration can evolve independently of `agent.js`.
- `REASONING_MODE` chooses the plugin at runtime (defaults to `baseline`). Each plugin must expose a `run(messages, tools, context)` method.
- `baseline` wraps the original 3-stage ToolCaller pipeline. `react` performs iterative “Thought → tool call → Observation” loops (capped by `REASONING_MAX_TURNS`) before requesting a final summarization pass.
- Plugins receive shared dependencies (LLM client, ToolCaller, TokenBudgetManager, max tool count) so they can respect the same context budgets and logging rules.
- Adding a new strategy only requires dropping another module into `src/reasoners/` and referencing it in the registry—no changes to `agent.js` or the entrypoint needed.

### 2. LLM Clients (`src/clients/llm/*.js`)

**Responsibilities:**

- Wrap each provider's SDK or REST API behind the shared `testConnection()` + `chat()` interface used by `LLMDispatcher`
- Normalize responses so downstream components always see `{ message: { content }, prompt_eval_count, eval_count }`
- Surface provider-specific configuration errors early (missing keys, invalid models, etc.)

**Current Implementations:**

- `ollama.js` – connects to a self-hosted Ollama endpoint via the official SDK and exposes both `chat()` and `generate()` helpers. Tooling is prompt-based (no tools API).
- `gemini.js` – calls Google's Generative Language REST API using JSON payloads with system instructions and content parts
- `mistral.js` – targets the Mistral `chat/completions` endpoint with standard OpenAI-style message objects

**Design Notes:**

- Constructors validate that required fields (API keys, models, base URLs) are present before any network call
- `testConnection()` executes a lightweight health probe (`/models` style endpoint) and warns if the requested model is unavailable
- `chat()` catches transport errors and wraps them in provider-specific error messages so troubleshooting remains straightforward

### 3. Matrix Client (`src/clients/messaging/matrix.js`)

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

### 4. Messaging Dispatcher (`src/lib/messagingDispatcher.js`)

**Responsibilities:**

- Provide a thin adapter that selects the active messaging provider at runtime
- Instantiate the correct client based on `CHANNEL_PROVIDER` (Matrix adapter ships by default)
- Expose a consistent API: `connect`, `disconnect`, `onMessage`, `sendMessage`, `setTyping`

**Key Design Decisions:**

- Composition over inheritance: providers remain self-contained classes, while the dispatcher simply delegates
- Optional `client` injection keeps tests lightweight and enables custom providers without touching registry code
- Capability checks guard against partially implemented clients so failures surface early during startup

**Integration Points:**

- `src/index.js` builds one dispatcher and shares it with the Agent runtime + cron scheduler
- `ScheduledMessageDispatcher` depends on the dispatcher interface instead of Matrix specifics, so new transports automatically flow through scheduled jobs

### 5. Semantic Tool Selection (`src/lib/toolCaller.js`)

**Purpose:**

Semantic tool selection keeps prompts small for consumer-grade hardware by sending only a few tools to the LLM.

**Problem:** Sending all tool schemas to the LLM wastes ~1000 tokens per request:

- 20 tools × 50 tokens each = 1000 tokens consumed
- With 4K-8K effective context, this leaves only 3K-7K for conversation history
- LLM must parse irrelevant tools on every request (processing overhead)

**Solution:** Use lightweight semantic search over tool metadata to select a small subset:

- Tokenize user query and tool metadata (name, description, category, keywords)
- Compute similarity (TF-IDF + cosine) and rank tools
- Cap the selection with `MAX_TOOLS` (default 8) so only the most relevant definitions are considered
- Core tools (if configured via `CORE_TOOLS`) are prioritized within that cap
- After semantic selection, TokenBudgetManager enforces `MAX_TOOL_CONTEXT_TOKENS` to ensure the serialized schemas still fit inside the global prompt budget

**Design:**

- Zero external dependencies (fast and lightweight)
- Works with any LLM provider
- Keeps tool schemas under tight context budgets

### 6. Tools (`src/tools/*.js`)

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
- `remind` - Schedule recurring chat reminders that surface in-room with full history
- `cron` - Schedule headless recurring commands (responses logged to `memory/cron-runs.log`)

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

## LLM Provider Architecture (Multi-Cloud)

### Overview

To support multiple LLM backends, WORM introduces a provider-agnostic abstraction layer. The agent and ToolCaller interact with an `LLMProvider` interface rather than individual SDKs. Each provider implementation encapsulates connection details, authentication, and capability quirks (tool calling, function calling, streaming availability).

```
Agent → ToolCaller → LLMRouter → (Ollama | Gemini | Mistral)
```

### Provider Interface

All providers implement a common shape:

```javascript
class BaseProvider {
  async testConnection();              // Validate credentials/model availability
  async chat({ messages, tools });     // Return assistant text + tool directives
  supportsToolCalling = boolean;       // Indicates native function calling support
}
```

- **Initialization**: `LLMRouter` reads `LLM_PROVIDER` and instantiates the matching class with provider-specific config from `.env`.
- **Tool Compatibility**: If a provider lacks native function calling, the router falls back to ToolCaller’s JSON parsing.
- **Error Handling**: Providers standardize errors (message + optional retriable flag) so the agent can react consistently.

### Environment Configuration

| Provider      | `LLM_PROVIDER` value | Required env vars                                                 |
| ------------- | -------------------- | ----------------------------------------------------------------- |
| Ollama        | `ollama`             | `OLLAMA_BASE_URL`, `OLLAMA_MODEL`                                 |
| Google Gemini | `gemini`             | `GEMINI_API_KEY`, `GEMINI_MODEL` (e.g., `gemini-1.5-pro-latest`)  |
| Mistral       | `mistral`            | `MISTRAL_API_KEY`, `MISTRAL_MODEL` (e.g., `mistral-large-latest`) |

Optional knobs shared across providers:

- `LLM_TIMEOUT_MS` – request timeout override
- `LLM_MAX_TOKENS` – output length cap
- `LLM_TEMPERATURE` – sampling control

### Provider-Specific Notes

- **Ollama**: Local/remote self-hosted. Native tool calling supported; no API key. Existing `OllamaClient` becomes one provider implementation.
- **Google Gemini**: Uses REST API with API key header. Supports JSON schema tool calling. Requires safety settings alignment.
- **Mistral**: Chat Completions API with tool call support (beta). Ensure `response_format` set when using JSON outputs.

### Router Responsibilities

1. **Provider Selection**: Read `LLM_PROVIDER`, default to `ollama`. Throw descriptive error if unsupported value.
2. **Capability Detection**: Expose `supportsToolCalling`. If false, ToolCaller must handle tool invocation decisions entirely.
3. **Request Normalization**: Convert internal message format to provider payload (role mapping, tool schema translation, safety parameters).
4. **Response Normalization**: Convert provider outputs back into `{ message, tool_calls, usage }` so downstream logic remains unchanged.
5. **Telemetry**: Standardize logging (latency, tokens) for comparability across providers.

### Security & Secrets

- API keys live in `.env` and must **never** be logged.
- Each provider client reads its key at instantiation and stores it in memory only.
- When multiple providers coexist, only the active provider’s credentials are required; others can remain unset.
- Future enhancement: support key rotation via runtime config reload.

### Testing Strategy

- **Unit Tests**: Mock each provider’s HTTP SDK and assert payload translation + error handling.
- **Contract Tests**: Small suite hitting live endpoints (behind feature flag) to validate tool calling compatibility.
- **Fallback Behavior**: Tests ensuring ToolCaller gracefully handles providers without native tool support.

### Migration Plan

1. **Phase 1 (Doc & Config)**: Introduce `LLM_PROVIDER` and provider-specific env placeholders in `.env.example` + docs (this document).
2. **Phase 2 (Router)**: Implement `LLMRouter` + provider classes (Ollama, Gemini, Mistral). Wire into `src/index.js` and Agent.
3. **Phase 3 (Testing & Telemetry)**: Add provider unit tests, update logging, expose metrics (latency/token counts) per provider.
4. **Phase 4 (Polish)**: Add health checks, retry logic, dynamic provider switching if needed.

This layered approach ensures the agent remains agnostic to specific vendors while enabling deployments to select the best LLM for their environment (local, cost-optimized, or bleeding-edge cloud models). 6. **Safe**: Input validation, no arbitrary code execution 7. **Focused**: Single purpose, not multi-function tools

### Cron Tool & Scheduler

**Goal**: Let trusted users ask WORM to run recurring commands (for example, "every morning ask for the BTC price") without keeping their Matrix client online. The `cron` tool gives the LLM a single entry point to create, list, and cancel those jobs while the runtime handles durability and execution.

#### Components

- `src/tools/schedulerToolFactory.js`
  - Centralizes validation, parameter schema, and scheduling logic shared by both scheduler tools.
  - Guarantees consistent caps (command length, interval bounds, max job slots) before delegating to the service layer.
- `src/tools/remind.js`
  - Chat-facing scheduler that posts reminders back to Matrix with the user’s conversation history intact.
  - Wraps the shared factory with `delivery: chat`, fixed `reminder` type, and reminder-specific metadata.
- `src/tools/cron.js`
  - Headless automation entry point that never posts to chat; results are logged via `cronRunLogger` instead.
  - Uses the shared factory with `delivery: headless` and command semantics.
- `src/lib/cronRunLogger.js`
  - Minimal append-only logger that writes headless job outcomes to `memory/cron-runs.log` for auditing.
- `src/lib/cronStore.js`
  - JSON-backed persistence modeled after `Memory`, but scoped to scheduled jobs.
  - Stores each user's jobs in `memory/cron/<user-hash>.json` with write-through updates and FIFO eviction when caps are exceeded.
- `src/lib/cronService.js`
  - In-memory registry of active jobs hydrated from cronStore on startup.
  - Public API: `schedule(job)`, `cancel(jobId, userId)`, `list(userId)`, `restore()`.
  - Wraps Node timers in a single scheduler loop that throttles concurrent executions (max one fired job per second) to protect low-VRAM devices.
- Synthetic message bridge (`src/lib/scheduledMessageDispatcher.js`)
  - Converts due jobs into pseudo-user messages so the agent, ToolCaller, and Matrix clients handle them like normal traffic.
  - Sends reminders to the room with typing indicators, but routes headless jobs through the agent with `persistHistory: false` and logs the output instead of chatting.

#### Job Data Model

```json
{
  "id": "1",
  "userId": "@alice:matrix.org",
  "type": "command",
  "delivery": "headless",
  "intervalMinutes": 30,
  "command": "Check BTC price and summarize",
  "startAt": "2026-02-02T08:00:00.000Z",
  "lastRunAt": "2026-02-02T09:00:00.000Z",
  "nextRunAt": "2026-02-02T09:30:00.000Z",
  "maxRuns": 20,
  "runCount": 4,
  "status": "active"
}
```

- `intervalMinutes` keeps schemas small and LLM-friendly. Advanced cron syntax can be introduced later without breaking existing jobs.
- `maxRuns` (default infinity) plus optional `endAt` guarantee deterministic shutdown.
- `nextRunAt` is stored to avoid recomputing schedules for every tick.

#### Scheduling Flow

1. User request → LLM calls `cron` with `{ action: 'schedule', command, intervalMinutes, startAt?, maxRuns? }`.
2. Tool validation → ensures `context.userId`, clamps intervals, enforces per-user caps.
3. Persist + register → `cronService.schedule()` writes to cronStore and arms the timer.
4. Tick loop → when `Date.now() >= nextRunAt`, cronService enqueues the job.
5. Dispatch → scheduledMessageDispatcher feeds the command into the agent; reminders post responses back to the room, while headless cron jobs call the agent with `persistHistory: false` and write outputs to `memory/cron-runs.log`.
6. Bookkeeping → `lastRunAt`, `runCount`, and `nextRunAt` update; job transitions to `completed` once limits are met.

#### Listing and Cancellation

- `{ action: 'list' }` returns compact rows: job ID, interval, next run ISO timestamp, remaining executions.
- Jobs are numbered per user from `1` to `5`, so cancelling a task is as simple as saying “Cancel job 3.” IDs are recycled when a slot is freed.
- `{ action: 'cancel', jobId }` marks the job as `cancelled`, clears timers, and persists state. Responses state whether a job was found.

#### Operational Constraints

- **Durability**: `cronService.restore()` runs before Matrix login so jobs survive restarts.
- **Throttling**: Due jobs enter an in-memory FIFO; the dispatcher pops at most one per second to prevent tool-call storms.
- **Safety**: Jobs inherit the creator's `userId`, so existing allowlist rules and history caps still apply. No scheduling for anonymous contexts.
- **Observability**: Lifecycle logs (`scheduled`, `fired`, `cancelled`, `errored`) include jobId and userId. Headless runs append their outputs (or errors) to `memory/cron-runs.log`, while reminder failures still notify the room.
- **Testing**: Unit tests mock timers to cover schedule, restore, cancellation, and dispatch without waiting for real time.

This split keeps the cron tool stateless while delegating long-lived responsibilities to purpose-built services, aligning with WORM's separation-of-concerns constraints.

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

**Optional Variables:**

- `MATRIX_ALLOWED_USERS` - Comma-separated user IDs (empty = allow all)
- `MATRIX_ALLOWED_ROOMS` - Comma-separated room IDs (empty = allow all rooms)
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

**System Prompt:** Edit `_buildSystemPrompt()` in `src/agents/agent.js`
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

- Conversation history dynamically trimmed by TokenBudgetManager
  - **Primary Purpose**: Keep prompts within `MAX_CONTEXT_TOKENS` for consumer-grade hardware (Gemma 3 27B, Qwen 3 32B at Q4)
  - **Optional**: `MAX_HISTORY` still enforces a hard cap when operators prefer it
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
