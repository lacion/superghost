import type { StepDescription } from "./types.ts";

/** Maps raw MCP tool names to human-readable action names */
const PREFIX_MAP: Record<string, string> = {
  browser_navigate: "Navigate",
  browser_click: "Click",
  browser_type: "Type",
  browser_screenshot: "Screenshot",
  browser_wait_for_text: "Wait for text",
  browser_hover: "Hover",
  browser_select_option: "Select",
  browser_go_back: "Go back",
  browser_go_forward: "Go forward",
  browser_press_key: "Press key",
  browser_drag: "Drag",
  browser_resize: "Resize",
  browser_handle_dialog: "Handle dialog",
  browser_file_upload: "Upload file",
  browser_pdf_save: "Save PDF",
  browser_close: "Close",
  browser_console_messages: "Console messages",
  browser_install: "Install browser",
  browser_tab_list: "List tabs",
  browser_tab_new: "New tab",
  browser_tab_select: "Select tab",
  browser_tab_close: "Close tab",
  browser_network_requests: "Network requests",
  browser_snapshot: "Snapshot",
};

/** Maps tool names to the input field used as the key argument */
const KEY_ARG_MAP: Record<string, string> = {
  browser_navigate: "url",
  browser_click: "element",
  browser_type: "element",
  browser_hover: "element",
  browser_select_option: "element",
  browser_press_key: "key",
  browser_wait_for_text: "text",
};

/**
 * Convert a raw tool call into a human-readable description.
 *
 * Known tools (browser_navigate, browser_click, etc.) map to friendly names.
 * Unknown tools fall back to: strip underscores, capitalize first letter.
 * Key arguments are extracted based on tool type (e.g., "url" for navigate).
 */
export function describeToolCall(
  toolName: string,
  input: Record<string, unknown>,
): StepDescription {
  // Look up human name, or derive from raw name as fallback
  const action =
    PREFIX_MAP[toolName] ??
    toolName
      .replace(/_/g, " ")
      .replace(/^\w/, (c) => c.toUpperCase());

  // Look up which input field is the key argument for this tool
  const keyArgField = KEY_ARG_MAP[toolName];
  const rawKeyArg = keyArgField ? input[keyArgField] : undefined;
  const keyArg =
    rawKeyArg !== undefined && rawKeyArg !== null && String(rawKeyArg) !== ""
      ? String(rawKeyArg)
      : undefined;

  const full = keyArg ? `${action} \u2192 ${keyArg}` : action;

  return { action, keyArg, full };
}
