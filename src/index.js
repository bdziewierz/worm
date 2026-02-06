#!/usr/bin/env node

import 'dotenv/config';
import chalk from 'chalk';
import { Agent } from './agent/agent.js';
import { getTools } from './tools/index.js';
import { CronStore } from './lib/cronStore.js';
import { CronService } from './lib/cronService.js';
import { ScheduledMessageDispatcher } from './lib/scheduledMessageDispatcher.js';
import { LLMDispatcher } from './lib/llmDispatcher.js';
import { MessagingDispatcher } from './lib/messagingDispatcher.js';

console.log(chalk.blue.bold('\n🤖 Starting WORM Personal Assistant...\n'));

// Validate environment variables
const llmProvider = (process.env.LLM_PROVIDER || 'ollama').toLowerCase();
const channelProvider = (process.env.CHANNEL_PROVIDER || 'matrix').toLowerCase();

const llmProviderConfigs = {
  ollama: {
    label: 'Ollama',
    required: ['OLLAMA_BASE_URL', 'OLLAMA_MODEL'],
    buildConfig: env => ({
      baseUrl: env.OLLAMA_BASE_URL,
      model: env.OLLAMA_MODEL,
    }),
  },
  gemini: {
    label: 'Google Gemini',
    required: ['GEMINI_API_KEY', 'GEMINI_MODEL'],
    buildConfig: env => ({
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL,
      apiBaseUrl: env.GEMINI_API_BASE_URL,
    }),
  },
  mistral: {
    label: 'Mistral',
    required: ['MISTRAL_API_KEY', 'MISTRAL_MODEL'],
    buildConfig: env => ({
      apiKey: env.MISTRAL_API_KEY,
      model: env.MISTRAL_MODEL,
      apiBaseUrl: env.MISTRAL_API_BASE_URL,
    }),
  },
};

const channelProviderConfigs = {
  matrix: {
    label: 'Matrix',
    required: ['MATRIX_HOMESERVER', 'MATRIX_USER_ID', 'MATRIX_ACCESS_TOKEN'],
    buildConfig: env => ({
      homeserver: env.MATRIX_HOMESERVER,
      userId: env.MATRIX_USER_ID,
      accessToken: env.MATRIX_ACCESS_TOKEN,
      allowedUsers: env.MATRIX_ALLOWED_USERS,
      allowedRooms: env.MATRIX_ALLOWED_ROOMS,
    }),
  },
};

const providerMeta = llmProviderConfigs[llmProvider];
if (!providerMeta) {
  console.error(chalk.red(`❌ Unsupported LLM provider "${llmProvider}".`));
  console.error(
    chalk.yellow(
      `Supported providers: ${Object.keys(llmProviderConfigs)
        .map(name => name)
        .join(', ')}`
    )
  );
  process.exit(1);
}

const channelMeta = channelProviderConfigs[channelProvider];
if (!channelMeta) {
  console.error(chalk.red(`❌ Unsupported messaging provider "${channelProvider}".`));
  console.error(
    chalk.yellow(
      `Supported providers: ${Object.keys(channelProviderConfigs)
        .map(name => name)
        .join(', ')}`
    )
  );
  process.exit(1);
}
const requiredEnvVars = [...new Set([...providerMeta.required, ...channelMeta.required])];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error(chalk.red('❌ Missing required environment variables:'));
  missingVars.forEach(varName => {
    console.error(chalk.red(`   - ${varName}`));
  });
  console.error(chalk.yellow('\nPlease copy .env.example to .env and fill in the values.'));
  process.exit(1);
}

async function main() {
  try {
    // Initialize clients
    console.log(chalk.cyan(`📡 Connecting to ${providerMeta.label}...`));
    const llmDispatcher = new LLMDispatcher({
      provider: llmProvider,
      config: providerMeta.buildConfig(process.env),
    });

    // Test LLM connection
    await llmDispatcher.testConnection();
    console.log(chalk.green(`✓ ${providerMeta.label} connected\n`));

    console.log(chalk.cyan(`💬 Connecting to ${channelMeta.label}...`));
    const messagingDispatcher = new MessagingDispatcher({
      provider: channelProvider,
      config: channelMeta.buildConfig(process.env),
    });

    await messagingDispatcher.connect();
    console.log(chalk.green(`✓ ${channelMeta.label} connected\n`));

    // Initialize agent with tools
    const services = {};
    const tools = getTools();
    const parsedMaxTools = Number.parseInt(process.env.MAX_TOOLS, 10);
    const agent = new Agent(llmDispatcher, tools, {
      maxHistory: Number.isInteger(parseInt(process.env.MAX_HISTORY, 10))
        ? parseInt(process.env.MAX_HISTORY, 10)
        : null,
      name: process.env.NAME,
      personality: process.env.PERSONALITY,
      background: process.env.BACKGROUND,
      speakingStyle: process.env.SPEAKING_STYLE,
      services,
      maxContextTokens: Number.parseInt(process.env.MAX_CONTEXT_TOKENS, 10) || 16000,
      responseBufferTokens: Number.parseInt(process.env.RESPONSE_TOKEN_BUFFER, 10) || 1024,
      maxToolContextTokens: Number.parseInt(process.env.MAX_TOOL_CONTEXT_TOKENS, 10) || 4000,
      maxTools: Number.isInteger(parsedMaxTools) ? parsedMaxTools : null,
    });
    if (channelProvider === 'matrix') {
      const roomsMsg = process.env.MATRIX_ALLOWED_ROOMS
        ? `Allowed rooms: ${process.env.MATRIX_ALLOWED_ROOMS}`
        : 'Listening in all rooms';
      const usersMsg = process.env.MATRIX_ALLOWED_USERS
        ? `Allowed users: ${process.env.MATRIX_ALLOWED_USERS}`
        : 'Allowing all users';
      console.log(chalk.gray(`${roomsMsg}\n${usersMsg}\n`));
    }

    const cronStore = new CronStore();
    const dispatcher = new ScheduledMessageDispatcher({
      agent,
      messagingClient: messagingDispatcher,
    });
    const cronService = new CronService({ store: cronStore, dispatcher });
    services.cron = cronService;
    const restoredCount = await cronService.restore();
    console.log(chalk.gray(`⏰ Restored ${restoredCount} scheduled job(s)`));

    // Handle Matrix messages
    messagingDispatcher.onMessage(async message => {
      console.log(
        chalk.blue(
          `\n📨 Received from ${message.sender} in room ${message.roomId}: ${message.text}`
        )
      );

      try {
        await messagingDispatcher.setTyping(message.roomId, true);
        const response = await agent.processMessage(message.text, {
          userId: message.sender,
          roomId: message.roomId,
        });
        await messagingDispatcher.sendMessage(response, message.roomId);
        console.log(chalk.green(`✓ Sent response\n`));
      } catch (error) {
        console.error(chalk.red(`❌ Error processing message: ${error.message}`));
        await messagingDispatcher.sendMessage(
          `Sorry, I encountered an error: ${error.message}`,
          message.roomId
        );
      } finally {
        await messagingDispatcher.setTyping(message.roomId, false);
      }
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log(chalk.yellow('\n\n👋 Shutting down gracefully...'));
      await cronService.shutdown();
      await messagingDispatcher.disconnect();
      process.exit(0);
    });
  } catch (error) {
    console.error(chalk.red(`\n❌ Fatal error: ${error.message}`));
    console.error(error.stack);
    process.exit(1);
  }
}

main();
