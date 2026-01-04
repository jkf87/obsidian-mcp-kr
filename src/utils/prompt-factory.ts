import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { Prompt } from "../types.js";

const prompts = new Map<string, Prompt>();

/**
 * Register a prompt for use in the MCP server
 */
export function registerPrompt(prompt: Prompt): void {
  if (prompts.has(prompt.name)) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Prompt "${prompt.name}" is already registered`
    );
  }
  prompts.set(prompt.name, prompt);
}

/**
 * List all registered prompts
 */
export function listPrompts() {
  return {
    prompts: Array.from(prompts.values()).map(prompt => ({
      name: prompt.name,
      description: prompt.description,
      arguments: prompt.arguments
    }))
  };
}

/**
 * Get a specific prompt by name
 */
export async function getPrompt(name: string, vaults: Map<string, string>, args?: any) {
  const prompt = prompts.get(name);
  if (!prompt) {
    throw new McpError(ErrorCode.MethodNotFound, `Prompt not found: ${name}`);
  }

  try {
    return await prompt.handler(args, vaults);
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to execute prompt: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
