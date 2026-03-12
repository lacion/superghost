/**
 * Escape XML-special characters in text content and attribute values.
 * Ampersand is replaced FIRST to avoid double-escaping other replacements.
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Strip ANSI escape sequences from text.
 * Uses the well-known ansi-regex pattern covering CSI, OSC, and other sequences.
 */
export function stripAnsi(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI stripping requires matching control characters
  return text.replace(/[\u001B\u009B][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "");
}
