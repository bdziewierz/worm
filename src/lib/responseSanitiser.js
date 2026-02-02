export function responseSanitiser(text) {
  if (!text) return '';

  let cleaned = text;

  // Remove template tokens (including pipe-delimited special tokens)
  cleaned = cleaned
    .replace(/<\|assistant\|>/g, '')
    .replace(/<\|user\|>/g, '')
    .replace(/<\|system\|>/g, '')
    .replace(/<\|start_header\|>/g, '')
    .replace(/<\|end_header\|>/g, '')
    .replace(/<\|end\|>/g, '')
    .replace(/<s>/g, '')
    .replace(/<\/s>/g, '')
    .replace(/<tool>/g, '')
    .replace(/<\/tool>/g, '')
    .replace(/<tool_call>/g, '')
    .replace(/<\/tool_call>/g, '');

  // Remove thinking/reasoning tags
  cleaned = cleaned
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/g, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/g, '');

  // Remove instruction format markers (including content between them)
  cleaned = cleaned
    .replace(/\[INST\][\s\S]*?\[\/INST\]/g, '')
    .replace(/<<SYS>>[\s\S]*?<<%2FSYS>>/g, '')
    .replace(/###/g, '');

  // Unwrap code blocks (especially for JSON)
  cleaned = cleaned.replace(/^```(?:json|javascript|js)?\s*\n?([\s\S]*?)\n?```$/m, '$1');

  // Remove role prefixes (at start or after newlines)
  cleaned = cleaned.replace(/^(Assistant:|AI:|Bot:|Human:|User:)\s*/gim, '');

  // Normalize multiple newlines (max 2 consecutive)
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}
