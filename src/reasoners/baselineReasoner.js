export class BaselineReasoner {
  constructor({ toolCaller }) {
    if (!toolCaller) {
      throw new Error('toolCaller is required for BaselineReasoner');
    }
    this.toolCaller = toolCaller;
  }

  async run(messages, tools, context = {}) {
    return this.toolCaller.run(messages, tools, context);
  }
}
