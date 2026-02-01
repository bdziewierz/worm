#!/usr/bin/env node

import 'dotenv/config';
import chalk from 'chalk';
import { OllamaClient } from './clients/ollama.js';
import { MatrixClient } from './clients/matrix.js';
import { Agent } from './agent/agent.js';
import { getTools } from './tools/index.js';

console.log(chalk.blue.bold('\n🤖 Starting WORM Personal Assistant...\n'));

// Validate environment variables
const requiredEnvVars = [
  'OLLAMA_BASE_URL',
  'OLLAMA_MODEL',
  'MATRIX_HOMESERVER',
  'MATRIX_USER_ID',
  'MATRIX_ACCESS_TOKEN',
  'MATRIX_ROOM_ID'
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
    console.log(chalk.cyan('📡 Connecting to Ollama...'));
    const ollamaClient = new OllamaClient({
      baseUrl: process.env.OLLAMA_BASE_URL,
      model: process.env.OLLAMA_MODEL
    });
    
    // Test Ollama connection
    await ollamaClient.testConnection();
    console.log(chalk.green('✓ Ollama connected\n'));

    console.log(chalk.cyan('💬 Connecting to Matrix...'));
    const matrixClient = new MatrixClient({
      homeserver: process.env.MATRIX_HOMESERVER,
      userId: process.env.MATRIX_USER_ID,
      accessToken: process.env.MATRIX_ACCESS_TOKEN,
      roomId: process.env.MATRIX_ROOM_ID,
      allowedUsers: process.env.MATRIX_ALLOWED_USERS
    });

    await matrixClient.connect();
    console.log(chalk.green('✓ Matrix connected\n'));

    // Initialize agent with tools
    const tools = getTools();
    const agent = new Agent(ollamaClient, tools);

    console.log(chalk.green.bold('✓ Assistant is ready!\n'));
    console.log(chalk.gray(`Listening for messages in room: ${process.env.MATRIX_ROOM_ID}\n`));

    // Handle Matrix messages
    matrixClient.onMessage(async (message) => {
      console.log(chalk.blue(`\n📨 Received: ${message.text}`));
      
      try {
        const response = await agent.processMessage(message.text);
        await matrixClient.sendMessage(response);
        console.log(chalk.green(`✓ Sent response\n`));
      } catch (error) {
        console.error(chalk.red(`❌ Error processing message: ${error.message}`));
        await matrixClient.sendMessage(`Sorry, I encountered an error: ${error.message}`);
      }
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log(chalk.yellow('\n\n👋 Shutting down gracefully...'));
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
