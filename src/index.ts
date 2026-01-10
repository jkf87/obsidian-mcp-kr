// MCP Server
export { ObsidianServer } from "./server.js";

// Types
export * from "./types.js";

// Tools
export { createCreateNoteTool } from "./tools/create-note/index.js";
export { createListAvailableVaultsTool } from "./tools/list-available-vaults/index.js";
export { createEditNoteTool } from "./tools/edit-note/index.js";
export { createSearchVaultTool } from "./tools/search-vault/index.js";
export { createMoveNoteTool } from "./tools/move-note/index.js";
export { createCreateDirectoryTool } from "./tools/create-directory/index.js";
export { createDeleteNoteTool } from "./tools/delete-note/index.js";
export { createAddTagsTool } from "./tools/add-tags/index.js";
export { createRemoveTagsTool } from "./tools/remove-tags/index.js";
export { createRenameTagTool } from "./tools/rename-tag/index.js";
export { createReadNoteTool } from "./tools/read-note/index.js";

// Utils
export * from "./utils/errors.js";
export * from "./utils/files.js";
export * from "./utils/links.js";
export * from "./utils/responses.js";
export * from "./utils/schema.js";
export * from "./utils/security.js";
export * from "./utils/tags.js";
export * from "./utils/tool-factory.js";
export * from "./utils/vault-resolver.js";

// Resources
export { listVaultResources, readVaultResource } from "./resources/resources.js";

// Prompts
export { listVaultsPrompt } from "./prompts/list-vaults/index.js";
export { listPrompts, getPrompt, registerPrompt } from "./utils/prompt-factory.js";
