export class ScheduledMessageDispatcher {
  constructor({ agent, matrixClient }) {
    if (!agent) {
      throw new Error('ScheduledMessageDispatcher requires an agent');
    }
    if (!matrixClient) {
      throw new Error('ScheduledMessageDispatcher requires a Matrix client');
    }
    this.agent = agent;
    this.matrixClient = matrixClient;
  }

  async dispatch(job) {
    if (!job?.command) {
      throw new Error('Job command is required');
    }
    if (!job.roomId) {
      throw new Error('Job roomId is required');
    }

    await this.matrixClient.setTyping(job.roomId, true, 10000);
    try {
      const response = await this.agent.processMessage(job.command, {
        userId: job.userId,
        roomId: job.roomId,
        jobId: job.id,
        source: 'cron',
      });
      await this.matrixClient.sendMessage(response, job.roomId);
    } catch (error) {
      const fallbackMessage = `Scheduled job ${job.id} failed: ${error.message}`;
      await this.matrixClient.sendMessage(fallbackMessage, job.roomId);
      throw error;
    } finally {
      await this.matrixClient.setTyping(job.roomId, false);
    }
  }
}
