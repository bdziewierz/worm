#!/usr/bin/env node

import 'dotenv/config';
import chalk from 'chalk';
import { MatrixClient } from './clients/matrix.js';
import { Agent } from './agent/agent.js';
import { getTools } from './tools/index.js';
import { CronStore } from './lib/cronStore.js';
import { CronService } from './lib/cronService.js';
import { ScheduledMessageDispatcher } from './lib/scheduledMessageDispatcher.js';
import { LLMDispatcher } from './lib/llmDispatcher.js';

console.log(chalk.blue.bold('\n🤖 Starting WORM Personal Assistant...\n'));

// Validate environment variables
const llmProvider = (process.env.LLM_PROVIDER || 'ollama').toLowerCase();

const llmProviderConfigs = {
  ollama: {
    label: 'Ollama',
    required: ['OLLAMA_BASE_URL', 'OLLAMA_MODEL'],
    buildConfig: env => ({
      baseUrl: env.OLLAMA_BASE_URL,
      model: env.OLLAMA_MODEL,
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

const requiredEnvVars = [
  ...providerMeta.required,
  'MATRIX_HOMESERVER',
  'MATRIX_USER_ID',
  'MATRIX_ACCESS_TOKEN',
];

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

    console.log(chalk.cyan('💬 Connecting to Matrix...'));
    const matrixClient = new MatrixClient({
      homeserver: process.env.MATRIX_HOMESERVER,
      userId: process.env.MATRIX_USER_ID,
      accessToken: process.env.MATRIX_ACCESS_TOKEN,
      allowedUsers: process.env.MATRIX_ALLOWED_USERS,
      allowedRooms: process.env.MATRIX_ALLOWED_ROOMS,
    });

    await matrixClient.connect();
    console.log(chalk.green('✓ Matrix connected\n'));

    // Initialize agent with tools
    const services = {};
    const tools = getTools();
    const agent = new Agent(llmDispatcher, tools, {
      maxHistory: parseInt(process.env.MAX_HISTORY, 10) || 5,
      name: process.env.NAME,
      personality: process.env.PERSONALITY,
      background: process.env.BACKGROUND,
      speakingStyle: process.env.SPEAKING_STYLE,
      services,
    });
    const roomsMsg = process.env.MATRIX_ALLOWED_ROOMS
      ? `Allowed rooms: ${process.env.MATRIX_ALLOWED_ROOMS}`
      : 'Listening in all rooms';
    const usersMsg = process.env.MATRIX_ALLOWED_USERS
      ? `Allowed users: ${process.env.MATRIX_ALLOWED_USERS}`
      : 'Allowing all users';
    console.log(chalk.gray(`${roomsMsg}\n${usersMsg}\n`));

    const cronStore = new CronStore();
    const dispatcher = new ScheduledMessageDispatcher({ agent, matrixClient });
    const cronService = new CronService({ store: cronStore, dispatcher });
    services.cron = cronService;
    const restoredCount = await cronService.restore();
    console.log(chalk.gray(`⏰ Restored ${restoredCount} scheduled job(s)`));

    // Handle Matrix messages
    matrixClient.onMessage(async message => {
      console.log(
        chalk.blue(
          `\n📨 Received from ${message.sender} in room ${message.roomId}: ${message.text}`
        )
      );

      try {
        await matrixClient.setTyping(message.roomId, true);
        const response = await agent.processMessage(message.text, {
          userId: message.sender,
          roomId: message.roomId,
        });
        await matrixClient.sendMessage(response, message.roomId);
        console.log(chalk.green(`✓ Sent response\n`));
      } catch (error) {
        console.error(chalk.red(`❌ Error processing message: ${error.message}`));
        await matrixClient.sendMessage(
          `Sorry, I encountered an error: ${error.message}`,
          message.roomId
        );
      } finally {
        await matrixClient.setTyping(message.roomId, false);
      }
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log(chalk.yellow('\n\n👋 Shutting down gracefully...'));
      await cronService.shutdown();
      await matrixClient.disconnect();
      process.exit(0);
    });
  } catch (error) {
    console.error(chalk.red(`\n❌ Fatal error: ${error.message}`));
    console.error(error.stack);
    process.exit(1);
  }
}

main();
