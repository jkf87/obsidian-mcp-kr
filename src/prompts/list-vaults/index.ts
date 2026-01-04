import { Prompt, PromptResult } from "../../types.js";

/**
 * Generates the system prompt for tool usage
 */
function generateSystemPrompt(): string {
  return `When using tools that require a vault name, use one of the vault names from the "list-vaults" prompt.
For example, when creating a note, you must specify which vault to create it in.

Available tools will help you:
- Create, edit, move, and delete notes
- Search for specific content within vaults
- Manage tags
- Create directories

The search-vault tool is for finding specific content within vaults, not for listing available vaults.
Use the "list-vaults" prompt to see available vaults.
Do not try to directly access vault paths - use the provided tools instead.`;
}

export const listVaultsPrompt: Prompt = {
  name: "list-vaults",
  description: "Show available Obsidian vaults. Use this prompt to discover which vaults you can work with.",
  arguments: [],
  handler: async (_, vaults: Map<string, string>): Promise<PromptResult> => {
    const vaultList = Array.from(vaults.entries())
      .map(([name, path]) => `- ${name}`)
      .join('\n');

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `The following Obsidian vaults are available:\n${vaultList}\n\nYou can use these vault names when working with tools. For example, to create a note in the first vault, use that vault's name in the create-note tool's arguments.`
          }
        },
        {
          role: "assistant",
          content: {
            type: "text",
            text: `I see the available vaults. I'll use these vault names when working with tools that require a vault parameter. For searching within vault contents, I'll use the search-vault tool with the appropriate vault name.`
          }
        }
      ]
    };
  }
};
