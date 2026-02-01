export function responseSanitiser(text) {
  if (!text) return '';

  let cleaned = text;

  // Remove template tokens
  cleaned = cleaned
    .replace(/<\|assistant\|>/g, '')
    .replace(/<\|user\|>/g, '')
    .replace(/<\|system\|>/g, '')
    .replace(/<s>/g, '')
    .replace(/<\/s>/g, '')
    .replace(/<tool>/g, '')
    .replace(/<\/tool>/g, '')
    .replace(/<tool_call>/g, '')
    .replace(/<\/tool_call>/g, '');

  // Remove thinking/reasoning tags
  cleaned = cleaned
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/g, '');

  // Remove instruction format markers
  cleaned = cleaned
    .replace(/\[INST\]/g, '')
    .replace(/\[\/INST\]/g, '')
    .replace(/<<SYS>>/g, '')
    .replace(/<<%2FSYS>>/g, '')
    .replace(/###/g, '');

  // Remove role prefixes at start
  cleaned = cleaned.replace(/^(Assistant:|AI:|Bot:|Human:|User:)\s*/i, '');

  // Unwrap code blocks (especially for JSON)
  cleaned = cleaned.replace(/^```(?:json|javascript|js)?\s*\n?([\s\S]*?)\n?```$/m, '$1');

  // Normalize multiple newlines (max 2 consecutive)
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}
