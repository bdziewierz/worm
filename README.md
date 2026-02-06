# WORM Personal Assistant

A command-line Node.js application that acts as a personal AI assistant with a pluggable LLM provider layer (Ollama, Google Gemini, Mistral) and a messaging dispatcher layer that can host multiple chat providers (Matrix adapter included). The assistant executes tools and responds through whichever chat channel you configure.

## Features

- 🤖 **AI Agent System**: Powered by a provider-agnostic LLM layer with custom 3-stage tool calling
- 💬 **Messaging Dispatcher**: Pluggable channel layer with the Matrix adapter bundled
- 🧠 **Intelligent Tool Routing**: LLM-based tool selection with efficient context usage
- 🔒 **User Access Control**: Allowlist system to restrict who can use the assistant
- 🔧 **Extensible Tools**: Easy to add new tools and capabilities
- 🌐 **Flexible LLM Providers**: Works with self-hosted Ollama or cloud APIs (Gemini, Mistral)
- 🪙 **Token-Efficient Design**: Dynamic context budgeting keeps prompts under hardware-friendly limits
- ⚡ **Modern Node.js**: Uses ESM modules and latest Node.js features (v20+)
- 📊 **Performance Monitoring**: Token usage and timing metrics for each stage

## LLM Provider Philosophy

WORM treats LLM selection as a deployment-time decision. The `LLM_PROVIDER` environment variable (see configuration section) chooses between Ollama and supported cloud vendors, while the agent always builds compact prompts/tool schemas to conserve context. This token discipline keeps costs low for cloud APIs and ensures the assistant can still run comfortably on constrained local hardware (24GB VRAM / 4K–8K effective context).

## Messaging Provider Layer

The messaging dispatcher mirrors the LLM layer: set `CHANNEL_PROVIDER` to pick which transport handles inbound/outbound chat. The repository currently ships with the `matrix` adapter, and adding another provider just means registering a client that implements the dispatcher contract (`connect`, `onMessage`, `sendMessage`, `setTyping`, `disconnect`).

## Prerequisites

- Node.js 22.0.0 or higher
- Access to your preferred LLM provider (self-hosted Ollama endpoint or cloud API key)
- Matrix account and access token
- A Matrix room for the assistant

## Installation

1. Clone or navigate to the project directory:

```bash
cd /Users/bo/Code/worm
```

2. Install dependencies:

```bash
npm install
```

3. Configure environment variables:

```bash
cp .env.example .env
```

4. Edit `.env` with your configuration:

```env
# LLM Provider Selection
LLM_PROVIDER=ollama               # Options: ollama | gemini | mistral

# Messaging Provider Selection
CHANNEL_PROVIDER=matrix           # Options: matrix (register more by extending messaging dispatcher)

# Ollama Configuration (if LLM_PROVIDER=ollama)
OLLAMA_BASE_URL=http://your-ollama-server:11434
OLLAMA_MODEL=llama3.2

# Google Gemini Configuration (if LLM_PROVIDER=gemini)
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-1.5-pro-latest

# Mistral Configuration (if LLM_PROVIDER=mistral)
MISTRAL_API_KEY=your_mistral_key
MISTRAL_MODEL=mistral-large-latest

# Matrix Configuration (if CHANNEL_PROVIDER=matrix)
MATRIX_HOMESERVER=https://matrix.org
MATRIX_USER_ID=@your-bot:matrix.org
MATRIX_ACCESS_TOKEN=your_access_token_here

# Security: Comma-separated list of allowed Matrix user IDs (leave empty to allow all)
# Example: @user1:matrix.org,@user2:matrix.org
MATRIX_ALLOWED_USERS=

# Security: Comma-separated list of allowed room IDs (leave empty to allow all rooms)
# Example: !room1:matrix.org,!room2:matrix.org
MATRIX_ALLOWED_ROOMS=

# Assistant Configuration
NAME=WORM
PERSONALITY=Helpful, concise, and direct.
MAX_HISTORY=5                     # Optional hard cap on stored turns (can be blank)

# Context budgeting (tokens)
MAX_CONTEXT_TOKENS=16000          # Total prompt budget (system + history + tools)
RESPONSE_TOKEN_BUFFER=1024        # Space reserved for model replies
MAX_TOOL_CONTEXT_TOKENS=4000      # Budget for tool schemas per turn
MAX_TOOLS=8                       # Semantic selection ceiling before budgeting
```

## Getting Matrix Access Token

**Create a dedicated bot account:**

1. Register a new Matrix account specifically for the bot (not your personal account)
   - Go to https://app.element.io and click "Create Account"
   - Use a descriptive name like `worm-assistant` or `my-bot`
   - Complete the registration

2. Get the access token using one of these methods:

   **Option A - Using Element Web:**
   - Log in to Element with your bot account
   - Click on your profile → All Settings → Help & About
   - Scroll down and click "Access Token"
   - Copy the token (keep it secure!)

   **Option B - Using curl:**

   ```bash
   curl -X POST "https://matrix.org/_matrix/client/r0/login" \
     -H "Content-Type: application/json" \
     -d '{
       "type": "m.login.password",
       "user": "your_bot_username",
       "password": "your_bot_password"
     }'
   ```

3. Add the bot to your room and configure the token in `.env`

## Getting Room ID

To get your Matrix room ID:

- In Element, go to Room Settings → Advanced
- Copy the "Internal Room ID" (starts with `!`)

## Running the Assistant

Start the assistant:

```bash
npm start
```

Or in development mode with auto-reload:

```bash
npm run dev
```

The assistant will:

1. Connect to the configured LLM provider
2. Join your Matrix room
3. Listen for messages and respond with AI-powered answers
4. Execute tools when needed

## Context Budget Controls

WORM now enforces per-turn token budgets so you can stay within the constraints of local GPUs or metered APIs.

- `MAX_CONTEXT_TOKENS`: Upper bound for system prompt + user/assistant history + tool schemas. Anything beyond this is trimmed.
- `RESPONSE_TOKEN_BUFFER`: Guaranteed headroom for the model’s reply. The agent only sends prompts if at least this many tokens remain.
- `MAX_TOOL_CONTEXT_TOKENS`: Budget for serialized tool definitions each turn. If semantic selection chooses more tools than the budget allows, the lowest-priority ones are dropped before hitting the model.
- `MAX_TOOLS`: Hard ceiling for how many tools the semantic router can return before budgeting occurs.
- `MAX_HISTORY`: Optional limit on stored conversation turns. Leave blank to let the token budget alone decide how much history fits.

These knobs are configurable per deployment so you can tailor the prompt size to a 4K local context or a 32K cloud model without touching code.

## Conversation History Persistence

- Each Matrix user (and any cron job tied to that user) gets a dedicated conversation log stored under `memory/history/` (file names are hashed for safety)
- Histories are loaded on demand, trimmed with `MAX_HISTORY` + the token budget manager, and then written back so restarts keep the latest context intact
- Remind jobs reuse the owner’s chat history so follow-up context remains available, while headless cron jobs skip history entirely to keep prompts small
- Delete or clear files in `memory/history/` (or call `Agent.clearHistory(userId)`) if you need a clean slate for a specific user

## Available Tools

The assistant comes with several built-in tools:

- **get_current_time**: Get current date and time with timezone support
- **calculate**: Perform mathematical calculations
- **get_weather**: Get weather information (mock - needs real API integration)
- **remind** ([src/tools/remind.js](src/tools/remind.js)): Schedule friendly chat reminders that run through the normal conversation pipeline (appears in-room, full history available)
- **cron** ([src/tools/cron.js](src/tools/cron.js)): Schedule headless automation commands (no chat output; responses are logged to `memory/cron-runs.log` for auditing — override via `CRON_RUN_LOG_PATH` if needed)

### Adding New Tools

Create a new tool file in `src/tools/`:

```javascript
export const myTool = {
  name: 'my_tool',
  description: 'Description of what the tool does',
  parameters: {
    type: 'object',
    properties: {
      param1: {
        type: 'string',
        description: 'Parameter description',
      },
    },
    required: ['param1'],
  },
  execute: async args => {
    // Tool implementation
    return {
      result: 'Tool output',
    };
  },
};
```

Then add it to `src/tools/index.js`:

```javascript
import { myTool } from './myTool.js';

export function getTools() {
  return [
    // ...existing tools,
    myTool,
  ];
}
```

## Project Structure

```
worm/
├── src/
│   ├── index.js              # Main entry point
│   ├── agent/
│   │   └── agent.js          # Agent logic with conversation management
│   ├── lib/
│   │   ├── llmDispatcher.js  # Provider-agnostic LLM orchestration
│   │   ├── messagingDispatcher.js # Provider-agnostic messaging orchestration
│   │   └── toolCaller.js     # Custom 3-stage tool calling system
│   ├── clients/
│   │   ├── llm/              # LLM provider clients
│   │   │   ├── gemini.js
│   │   │   ├── mistral.js
│   │   │   └── ollama.js
│   │   └── messaging/        # Messaging provider clients
│   │       └── matrix.js
│   └── tools/
│       ├── index.js          # Tool registry
│       ├── calculate.js      # Calculator tool
│       └── weather.js        # Weather tool (mock)
├── package.json
├── .env.example
├── .env                      # Your configuration (not in git)
└── README.md
```

## Usage Examples

Once running, you can interact with your assistant through Matrix:

**User:** What time is it?
**Assistant:** _[Uses get_current_time tool]_ It's currently 2026-02-01T10:30:00.000Z...

**User:** Calculate 25 _ 4 + 10
**Assistant:** _[Uses calculate tool]\* The result is 110.

**User:** What's the weather in London?
**Assistant:** _[Uses get_weather tool]_ The weather in London is...

## Troubleshooting

## Development Tools

WORM uses modern development practices with comprehensive testing and static analysis:

### Testing

Built with **Node.js native test runner** (no external dependencies)

**Run tests:**

```bash
npm test                  # Run once
npm run test:watch        # Watch mode (auto-rerun on changes)
npm run test:coverage     # With coverage report
```

### Static Analysis

### Available Commands

```bash
# Running
npm start                 # Start the assistant
npm run dev               # Development mode with auto-reload

# Testing
npm test                  # Run all tests
npm run test:watch        # Run tests in watch mode
npm run test:coverage     # Run tests with coverage report

# Code quality checks
npm run lint              # Run ESLint to check for code issues
npm run lint:fix          # Auto-fix ESLint issues where possible
npm run format            # Format all code with Prettier
npm run format:check      # Check if code is properly formatted

# Security
npm run audit             # Check for dependency vulnerabilities
```

### Pre-commit Hooks

Git hooks automatically run before each commit:

1. **lint-staged**: Runs ESLint and Prettier on staged files only (fast!)
2. **commitlint**: Validates commit message format

### Commit Message Format

Use conventional commits format:

```
<type>: <description>

[optional body]
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Build process or tooling changes

**Examples:**

```bash
git commit -m "feat: add weather tool with real API integration"
git commit -m "fix: resolve token counting issue in step 2"
git commit -m "docs: update security section in README"
```

### Tool Configuration

- **ESLint**: `eslint.config.js` - Code linting and quality
- **Prettier**: `.prettierrc` - Code formatting (single quotes, 100 char width)
- **Husky**: `.husky/` - Git hooks configuration
- **lint-staged**: `.lintstagedrc.json` - Pre-commit checks
- **commitlint**: `commitlint.config.js` - Commit message validation

### Bypassing Hooks (Not Recommended)

If absolutely necessary:

```bash
git commit --no-verify -m "emergency fix"
```

**Note**: Only use `--no-verify` in genuine emergencies. The hooks exist to maintain code quality.

## Troubleshooting

### Connection Issues

- **LLM Provider**: Ensure the selected provider endpoint/API key is valid
  - Ollama example health check:

    ```bash
    curl http://your-ollama-server:11434/api/tags
    ```

  - Cloud APIs: verify the corresponding API key is authorized and the model name matches an available deployment.

- **Matrix**: Verify your access token and room ID are correct

### Model Not Found (Ollama)

If your Ollama model isn't available, list available models:

```bash
curl http://your-ollama-server:11434/api/tags
```

Then update `OLLAMA_MODEL` in `.env` to match an available model.

## Security Notes

### User Access Control

The assistant includes an allowlist feature to control who can interact with it:

**To restrict access to specific users:**

1. Edit your `.env` file and set `MATRIX_ALLOWED_USERS` to a comma-separated list of Matrix user IDs:

   ```env
   MATRIX_ALLOWED_USERS=@alice:matrix.org,@bob:example.com
   ```

2. Restart the assistant. Only messages from users in the allowlist will be processed.

**To allow all users:**

- Leave `MATRIX_ALLOWED_USERS` empty or unset in `.env`

**Security behavior:**

- Unauthorized users' messages are silently rejected and logged
- The assistant will not respond or acknowledge messages from non-allowlisted users
- Access control is enforced before any message processing occurs

### Matrix Security

**Can Matrix users be spoofed?**

No, Matrix users cannot be spoofed when properly configured:

- **Homeserver Authentication**: Each message is cryptographically signed by the sender's homeserver, which verifies the user's identity
- **Federation Protocol**: The Matrix federation protocol ensures that user IDs are authenticated across servers
- **Access Tokens**: Your bot's access token authenticates all actions and cannot be used by other users

**Best Practices:**

- Keep your `.env` file secure and never commit it to version control
- The Matrix access token provides full access to your bot account - keep it secret
- Always use a dedicated bot account, never use your personal Matrix account
- Enable the user allowlist (`MATRIX_ALLOWED_USERS`) to restrict access
- Use strong, unique passwords for your Matrix bot account
- Review and sanitize any user inputs in custom tools
- Monitor the console output for rejected unauthorized access attempts

## Security Risks of AI Assistants

Running a personal AI assistant like WORM introduces several security considerations that you should understand and mitigate:

### Prompt Injection Attacks

**Risk**: Malicious users could craft messages that manipulate the LLM into:

- Ignoring system instructions and security constraints
- Executing unintended tools or commands
- Leaking sensitive information from conversation history
- Bypassing the user allowlist through social engineering of the AI

**Mitigation**:

- Always use the `MATRIX_ALLOWED_USERS` allowlist - never run with open access
- Review custom tool implementations for command injection vulnerabilities
- Be cautious about tools that execute system commands or access files
- Monitor logs for suspicious tool usage patterns
- Understand that LLMs can be manipulated through carefully crafted prompts

### Tool Execution Risks

**Risk**: Tools have direct access to your system and can:

- Execute arbitrary calculations or code
- Make network requests to external APIs
- Access local files (if you add file-related tools)
- Potentially be chained together in unexpected ways

**Mitigation**:

- Audit all tool implementations before adding them
- Limit tool capabilities to only what's necessary
- Avoid tools that execute shell commands or arbitrary code
- Use input validation and sanitization in all tools
- Run the assistant with minimal system permissions
- Consider sandboxing or containerization (Docker) for isolation

### Data Privacy Concerns

**Risk**: The assistant processes and stores:

- Full conversation history (up to `MAX_HISTORY` messages)
- Tool execution results that may contain sensitive data
- User queries that might include personal information
- All data is visible in console logs

**Mitigation**:

- Understand that conversation history is kept in memory
- Logs may contain sensitive information - secure your log files
- Consider what data you share with the assistant
- If using a shared/remote Ollama server, your data passes through it
- Review tool outputs for sensitive data before they enter conversation history
- Consider encrypting logs or limiting log retention

### Network Exposure

**Risk**: The assistant connects to remote services:

- Ollama server (processes all your queries and responses)
- Matrix homeserver (all messages flow through it)
- External APIs used by tools (weather, search, crypto prices, etc.)

**Mitigation**:

- Use HTTPS/TLS for all connections where possible
- Trust your Ollama server provider (or self-host)
- Understand that Matrix federation means messages may traverse multiple servers
- Review third-party API privacy policies
- Consider running Ollama locally instead of remotely
- Use a private Matrix homeserver if possible

### Access Token Compromise

**Risk**: If your Matrix access token is compromised:

- Attackers gain full control of your bot account
- Can send messages as the bot to any room it has access to
- Can read all messages in rooms the bot is in
- Can modify bot account settings and profile

**Mitigation**:

- Store `.env` file with restrictive permissions (chmod 600)
- Never commit `.env` to version control (already in .gitignore)
- Rotate access tokens periodically
- Use a dedicated bot account with minimal room memberships
- Monitor bot activity for suspicious behavior
- Revoke and regenerate tokens immediately if compromise is suspected

### Model Manipulation and Jailbreaking

**Risk**: LLMs can be manipulated to:

- Generate harmful, inappropriate, or misleading content
- Reveal their system prompts and internal instructions
- Behave in ways contrary to their intended purpose
- Provide false information with high confidence

**Mitigation**:

- Understand that LLMs are not perfectly controllable
- Don't rely on the assistant for critical decisions
- Verify important information from authoritative sources
- Use appropriate models for your use case
- Be aware that personality and behavior can be influenced by user prompts
- Accept that some level of unpredictability is inherent to LLMs

### Recommended Security Posture

**For Personal Use:**

- ✅ Use the user allowlist with only your Matrix ID
- ✅ Run on a trusted local network or VPS
- ✅ Use a dedicated bot account
- ✅ Regular security updates for Node.js and dependencies
- ✅ Monitor logs for unusual activity
- ✅ Limit tool capabilities to what you actually need

**For Shared/Team Use:**

- ✅ All personal use recommendations, plus:
- ✅ Strict user allowlist with verified team members only
- ✅ Regular access audits
- ✅ Consider containerization (Docker)
- ✅ Implement rate limiting if needed
- ✅ Document acceptable use policies
- ✅ Regular security reviews of custom tools

**Never Do:**

- ❌ Expose the assistant to the public internet without authentication
- ❌ Use your personal Matrix account as the bot
- ❌ Add tools that execute arbitrary shell commands
- ❌ Share your access token with anyone
- ❌ Store sensitive credentials in conversation history
- ❌ Trust the assistant with critical security decisions

**Bottom Line**: This is a personal AI assistant intended for trusted use. It provides convenience but requires responsible configuration and usage. The security model assumes you trust anyone in your allowlist and understand the risks of LLM-based systems.

## License

MIT

## Contributing

Feel free to add new tools, improve the agent logic, or enhance the Matrix integration!
