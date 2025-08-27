export class Memory {
  constructor(systemPrompt) {
    this.messages = [{ role: "system", content: systemPrompt }];
  }
  pushUser(text) {
    this.messages.push({ role: "user", content: text });
  }
  pushAssistant(text) {
    this.messages.push({ role: "assistant", content: text });
  }
  pushToolCall(toolCall) {
    this.messages.push({
      role: "assistant",
      tool_calls: [toolCall]
    });
  }
  pushToolResult(toolCallId, result) {
    this.messages.push({
      role: "tool",
      tool_call_id: toolCallId,
      name: "web_search",
      content: JSON.stringify(result).slice(0, 150000) // límite defensivo
    });
  }
  all() { return this.messages; }
}
