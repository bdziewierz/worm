# WORM Personal Assistant

A command-line Node.js application that acts as a personal AI assistant using Ollama LLM with Matrix chat integration. The assistant can execute various tools and respond to commands through a Matrix chat room.

## Features

- 🤖 **AI Agent System**: Powered by Ollama LLM with tool execution capabilities
- 💬 **Matrix Chat Integration**: Communicate with your assistant through Matrix
- 🧠 **Intelligent Tool Selection**: ONNX-based intent classification for accurate tool detection
- 🔒 **User Access Control**: Allowlist system to restrict who can use the assistant
- 🔧 **Extensible Tools**: Easy to add new tools and capabilities
- 🌐 **Remote Ollama**: Connects to remote Ollama server
- ⚡ **Modern Node.js**: Uses ESM modules and latest Node.js features (v20+)

## Prerequisites

- Node.js 22.0.0 or higher
- Access to a remote Ollama server
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
# Ollama Configuration
OLLAMA_BASE_URL=http://your-ollama-server:11434
OLLAMA_MODEL=llama3.2

# Matrix Configuration
MATRIX_HOMESERVER=https://matrix.org
MATRIX_USER_ID=@your-bot:matrix.org
MATRIX_ACCESS_TOKEN=your_access_token_here
MATRIX_ROOM_ID=!your_room_id:matrix.org

# Security: Comma-separated list of allowed Matrix user IDs (leave empty to allow all)
# Example: @user1:matrix.org,@user2:matrix.org
MATRIX_ALLOWED_USERS=

# Tools Configuration
CORE_TOOLS=get_current_time,calculate

# Intent Classifier (optional - uses fallback if disabled)
USE_INTENT_CLASSIFIER=true
INTENT_THRESHOLD=0.7
TOOL_THRESHOLD=0.5

# Assistant Configuration
ASSISTANT_NAME=WORM Assistant
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

## ONNX Model Setup (Required)

**Why Intent Classification?**

The assistant uses intent classification to **preselect relevant tools before sending to the LLM**. This dramatically reduces context window usage:
- Without preselection: ~1000 tokens wasted on irrelevant tool schemas
- With preselection: Only 2-3 relevant tools loaded (~100-200 tokens)
- Critical for consumer hardware: Gemma 3 27B limited to 4K-8K effective context due to VRAM constraints

To use the assistant, install the ONNX model:

1. Create models directory:
```bash
mkdir models
```

2. Download the model following instructions in [INTENT_CLASSIFIER.md](INTENT_CLASSIFIER.md)

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
1. Connect to your Ollama server
2. Join your Matrix room
3. Listen for messages and respond with AI-powered answers
4. Execute tools when needed

## Available Tools

The assistant comes with several built-in tools:

- **get_current_time**: Get current date and time with timezone support
- **calculate**: Perform mathematical calculations
- **get_weather**: Get weather information (mock - needs real API integration)

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
        description: 'Parameter description'
      }
    },
    required: ['param1']
  },
  execute: async (args) => {
    // Tool implementation
    return {
      result: 'Tool output'
    };
  }
};
```

Then add it to `src/tools/index.js`:
```javascript
import { myTool } from './myTool.js';

export function getTools() {
  return [
    // ...existing tools,
    myTool
  ];
}
```

## Project Structure

```
worm/
├── src/
│   ├── index.js              # Main entry point
│   ├── agent/
│   │   └── agent.js          # Agent logic with tool execution
│   ├── clients/
│   │   ├── ollama.js         # Ollama LLM client
│   │   └── matrix.js         # Matrix chat client
│   └── tools/
│       ├── index.js          # Tool registry
│       ├── getCurrentTime.js # Time tool
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
**Assistant:** *[Uses get_current_time tool]* It's currently 2026-02-01T10:30:00.000Z...

**User:** Calculate 25 * 4 + 10
**Assistant:** *[Uses calculate tool]* The result is 110.

**User:** What's the weather in London?
**Assistant:** *[Uses get_weather tool]* The weather in London is...

## Troubleshooting

### Connection Issues

- **Ollama**: Ensure your Ollama server is running and accessible
  ```bash
  curl http://your-ollama-server:11434/api/tags
  ```

- **Matrix**: Verify your access token and room ID are correct

### Model Not Found

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

## License

MIT

## Contributing

Feel free to add new tools, improve the agent logic, or enhance the Matrix integration!
