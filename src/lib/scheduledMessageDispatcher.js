export class ScheduledMessageDispatcher {
  constructor({ agent, messagingClient }) {
    if (!agent) {
      throw new Error('ScheduledMessageDispatcher requires an agent');
    }
    if (!messagingClient) {
      throw new Error('ScheduledMessageDispatcher requires a messaging client');
    }
    this.agent = agent;
    this.messagingClient = messagingClient;
  }

  async dispatch(job) {
    if (!job?.command) {
      throw new Error('Job command is required');
    }
    if (!job.roomId) {
      throw new Error('Job roomId is required');
    }

    await this.messagingClient.setTyping(job.roomId, true, 10000);
    try {
      const response = await this.agent.processMessage(job.command, {
        userId: job.userId,
        roomId: job.roomId,
        jobId: job.id,
        source: 'cron',
      });
      await this.messagingClient.sendMessage(response, job.roomId);
    } catch (error) {
      const fallbackMessage = `Scheduled job ${job.id} failed: ${error.message}`;
      await this.messagingClient.sendMessage(fallbackMessage, job.roomId);
      throw error;
    } finally {
      await this.messagingClient.setTyping(job.roomId, false);
    }
  }
}
