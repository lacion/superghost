import type { RunResult, TestResult } from "../runner/types.ts";

/** Describes a tool call in human-readable form */
export interface StepDescription {
  /** Human-readable action name, e.g. "Navigate", "Click" */
  action: string;
  /** Key argument value, e.g. "/login", "button.submit" */
  keyArg?: string;
  /** Full description string, e.g. "Navigate \u2192 /login" */
  full: string;
}

/** Information about a single step (tool call) during AI execution */
export interface StepInfo {
  /** 1-based step counter for the current test */
  stepNumber: number;
  /** Raw tool name, e.g. "browser_navigate" */
  toolName: string;
  /** Tool call input arguments */
  input: Record<string, unknown>;
  /** Human-readable description of the tool call */
  description: StepDescription;
}

/** Callback invoked for each tool call during AI execution */
export type OnStepProgress = (step: StepInfo) => void;

/** Interface for output reporting */
export interface Reporter {
  onTestStart(testName: string): void;
  onTestComplete(result: TestResult): void;
  onRunComplete(data: RunResult): void;
  onStepProgress?(step: StepInfo): void;
}
