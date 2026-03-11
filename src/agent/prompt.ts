/**
 * Build the system prompt for the QA automation agent.
 *
 * Includes test case, base URL, tool usage instructions, and optional
 * global/per-test context fields.
 */
export function buildSystemPrompt(
  testCase: string,
  baseUrl: string,
  globalContext?: string,
  testContext?: string,
): string {
  const lines: string[] = [
    "You are a QA automation agent. Execute the following test case and determine if it passes or fails.",
    "",
    `Test case: "${testCase}"`,
    `Base URL: "${baseUrl}"`,
    "",
    "You have access to both browser automation tools and HTTP/curl tools.",
    "Choose the appropriate tools based on the test case.",
    "",
    "For browser/UI tests:",
    "- Navigate to the base URL first",
    "- Use browser_snapshot to understand page state before acting",
    "- Use browser_click, browser_type for interactions",
    "",
    "For API tests:",
    "- Use the curl_request tool to make HTTP requests",
    "- Check status codes, headers, and response body",
    "",
    "Instructions:",
    "1. Analyze the test case and decide which tools to use.",
    "2. Execute the actions needed to verify the test case.",
    "3. Be methodical. If something doesn't work, try alternative approaches before declaring failure.",
    "4. When finished, provide your verdict as structured output with passed (boolean) and message (brief diagnostic).",
  ];

  if (globalContext) {
    lines.push("", "Additional context from the user:", globalContext);
  }

  if (testContext) {
    lines.push("", "Test-specific context:", testContext);
  }

  return lines.join("\n");
}
