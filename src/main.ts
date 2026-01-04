#!/usr/bin/env node
import { ObsidianServer } from "./server.js";
import { createCreateNoteTool } from "./tools/create-note/index.js";
import { createListAvailableVaultsTool } from "./tools/list-available-vaults/index.js";
import { createEditNoteTool } from "./tools/edit-note/index.js";
import { createSearchVaultTool } from "./tools/search-vault/index.js";
import { createMoveNoteTool } from "./tools/move-note/index.js";
import { createCreateDirectoryTool } from "./tools/create-directory/index.js";
import { createDeleteNoteTool } from "./tools/delete-note/index.js";
import { createAddTagsTool } from "./tools/add-tags/index.js";
import { createRemoveTagsTool } from "./tools/remove-tags/index.js";
import { createRenameTagTool } from "./tools/rename-tag/index.js";
import { createReadNoteTool } from "./tools/read-note/index.js";
import { listVaultsPrompt } from "./prompts/list-vaults/index.js";
import { registerPrompt } from "./utils/prompt-factory.js";
import path from "path";
import os from "os";
import { promises as fs, constants as fsConstants } from "fs";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { 
  checkPathCharacters, 
  checkLocalPath, 
  checkSuspiciousPath,
  sanitizeVaultName,
  checkPathOverlap 
} from "./utils/path.js";

interface VaultConfig {
  name: string;
  path: string;
}

async function main() {
  // Constants
  const MAX_VAULTS = 10; // Reasonable limit to prevent resource issues

  const vaultArgs = process.argv.slice(2);
  if (vaultArgs.length === 0) {
    const helpMessage = `
Obsidian MCP Server - Multi-vault Support

Usage: obsidian-mcp <vault1_path> [vault2_path ...]

Requirements:
- Paths must point to valid Obsidian vaults (containing .obsidian directory)
- Vaults must be initialized in Obsidian at least once
- Paths must have read and write permissions
- Paths cannot overlap (one vault cannot be inside another)
- Each vault must be a separate directory
- Maximum ${MAX_VAULTS} vaults can be connected at once

Security restrictions:
- Must be on a local filesystem (no network drives or mounts)
- Cannot point to system directories
- Hidden directories not allowed (except .obsidian)
- Cannot use the home directory root
- Cannot use symlinks that point outside their directory
- All paths must be dedicated vault directories

Note: If a path is not recognized as a vault, open it in Obsidian first to 
initialize it properly. This creates the required .obsidian configuration directory.

Recommended locations:
- ~/Documents/Obsidian/[vault-name]     # Recommended for most users
- ~/Notes/[vault-name]                  # Alternative location
- ~/Obsidian/[vault-name]              # Alternative location

Not supported:
- Network drives (//server/share)
- Network mounts (/net, /mnt, /media)
- System directories (/tmp, C:\\Windows)
- Hidden directories (except .obsidian)

Vault names are automatically generated from the last part of each path:
- Spaces and special characters are converted to hyphens
- Names are made lowercase for consistency
- Numbers are appended to resolve duplicates (e.g., 'work-vault-1')

Examples:
  # Valid paths:
  obsidian-mcp ~/Documents/Obsidian/Work ~/Documents/Obsidian/Personal
  → Creates vaults named 'work' and 'personal'

  obsidian-mcp ~/Notes/Work ~/Notes/Archive
  → Creates vaults named 'work' and 'archive'

  # Invalid paths:
  obsidian-mcp ~/Vaults ~/Vaults/Work     # ❌ Paths overlap
  obsidian-mcp ~/Work ~/Work              # ❌ Duplicate paths
  obsidian-mcp ~/                         # ❌ Home directory root
  obsidian-mcp /tmp/vault                 # ❌ System directory
  obsidian-mcp ~/.config/vault            # ❌ Hidden directory
  obsidian-mcp //server/share/vault       # ❌ Network path
  obsidian-mcp /mnt/network/vault         # ❌ Network mount
  obsidian-mcp ~/symlink-to-vault         # ❌ External symlink
`;

    // Log help message to stderr for user reference
    console.error(helpMessage);

    // Write MCP error to stdout
    process.stdout.write(JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: ErrorCode.InvalidRequest,
        message: "No vault paths provided. Please provide at least one valid Obsidian vault path."
      },
      id: null
    }));

    process.exit(1);
  }

  // Validate and normalize vault paths
  const normalizedPaths = await Promise.all(vaultArgs.map(async (vaultPath, index) => {
    try {
      // Expand home directory if needed
      const expandedPath = vaultPath.startsWith('~') ? 
        path.join(os.homedir(), vaultPath.slice(1)) : 
        vaultPath;
      
      // Normalize and convert to absolute path
      const normalizedPath = path.normalize(expandedPath)
        .replace(/[\/\\]+$/, ''); // Remove trailing slashes
      const absolutePath = path.resolve(normalizedPath);

      // Validate path is absolute and safe
      if (!path.isAbsolute(absolutePath)) {
        const errorMessage = `Vault path must be absolute: ${vaultPath}`;
        console.error(`Error: ${errorMessage}`);
        
        process.stdout.write(JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: ErrorCode.InvalidRequest,
            message: errorMessage
          },
          id: null
        }));
        
        process.exit(1);
      }

      // Check for suspicious paths and local filesystem
      const [suspiciousReason, localPathIssue] = await Promise.all([
        checkSuspiciousPath(absolutePath),
        checkLocalPath(absolutePath)
      ]);

      if (localPathIssue) {
        const errorMessage = `Invalid vault path (${localPathIssue}): ${vaultPath}\n` +
          `For reliability and security reasons, vault paths must:\n` +
          `- Be on a local filesystem\n` +
          `- Not use network drives or mounts\n` +
          `- Not contain symlinks that point outside their directory`;
        
        console.error(`Error: ${errorMessage}`);
        
        process.stdout.write(JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: ErrorCode.InvalidRequest,
            message: errorMessage
          },
          id: null
        }));
        
        process.exit(1);
      }

      if (suspiciousReason) {
        const errorMessage = `Invalid vault path (${suspiciousReason}): ${vaultPath}\n` +
          `For security reasons, vault paths cannot:\n` +
          `- Point to system directories\n` +
          `- Use hidden directories (except .obsidian)\n` +
          `- Point to the home directory root\n` +
          `Please choose a dedicated directory for your vault`;
        
        console.error(`Error: ${errorMessage}`);
        
        process.stdout.write(JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: ErrorCode.InvalidRequest,
            message: errorMessage
          },
          id: null
        }));
        
        process.exit(1);
      }

      try {
        // Check if path exists and is a directory
        const stats = await fs.stat(absolutePath);
        if (!stats.isDirectory()) {
          const errorMessage = `Vault path must be a directory: ${vaultPath}`;
          console.error(`Error: ${errorMessage}`);
          
          process.stdout.write(JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: ErrorCode.InvalidRequest,
              message: errorMessage
            },
            id: null
          }));
          
          process.exit(1);
        }

        // Check if path is readable and writable
        await fs.access(absolutePath, fsConstants.R_OK | fsConstants.W_OK);

        // Check if this is a valid Obsidian vault
        const obsidianConfigPath = path.join(absolutePath, '.obsidian');
        const obsidianAppConfigPath = path.join(obsidianConfigPath, 'app.json');
        
        try {
          // Check .obsidian directory
          const configStats = await fs.stat(obsidianConfigPath);
          if (!configStats.isDirectory()) {
            const errorMessage = `Invalid Obsidian vault configuration in ${vaultPath}\n` +
              `The .obsidian folder exists but is not a directory\n` +
              `Try removing it and reopening the vault in Obsidian`;
            
            console.error(`Error: ${errorMessage}`);
            
            process.stdout.write(JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: ErrorCode.InvalidRequest,
                message: errorMessage
              },
              id: null
            }));
            
            process.exit(1);
          }

          // Check app.json to verify it's properly initialized
          await fs.access(obsidianAppConfigPath, fsConstants.R_OK);
          
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            const errorMessage = `Not a valid Obsidian vault (${vaultPath})\n` +
              `Missing or incomplete .obsidian configuration\n\n` +
              `To fix this:\n` +
              `1. Open Obsidian\n` +
              `2. Click "Open folder as vault"\n` +
              `3. Select the directory: ${absolutePath}\n` +
              `4. Wait for Obsidian to initialize the vault\n` +
              `5. Try running this command again`;
            
            console.error(`Error: ${errorMessage}`);
            
            process.stdout.write(JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: ErrorCode.InvalidRequest,
                message: errorMessage
              },
              id: null
            }));
          } else {
            const errorMessage = `Error checking Obsidian configuration in ${vaultPath}: ${error instanceof Error ? error.message : String(error)}`;
            console.error(`Error: ${errorMessage}`);
            
            process.stdout.write(JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: ErrorCode.InternalError,
                message: errorMessage
              },
              id: null
            }));
          }
          process.exit(1);
        }

        return absolutePath;
      } catch (error) {
        let errorMessage: string;
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          errorMessage = `Vault directory does not exist: ${vaultPath}`;
        } else if ((error as NodeJS.ErrnoException).code === 'EACCES') {
          errorMessage = `No permission to access vault directory: ${vaultPath}`;
        } else {
          errorMessage = `Error accessing vault path ${vaultPath}: ${error instanceof Error ? error.message : String(error)}`;
        }
        
        console.error(`Error: ${errorMessage}`);
        
        process.stdout.write(JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: ErrorCode.InvalidRequest,
            message: errorMessage
          },
          id: null
        }));
        
        process.exit(1);
      }
    } catch (error) {
      const errorMessage = `Error processing vault path ${vaultPath}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`Error: ${errorMessage}`);
      
      process.stdout.write(JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: ErrorCode.InternalError,
          message: errorMessage
        },
        id: null
      }));
      
      process.exit(1);
    }
  }));

  // Validate number of vaults
  if (vaultArgs.length > MAX_VAULTS) {
    const errorMessage = `Too many vaults specified (${vaultArgs.length})\n` +
      `Maximum number of vaults allowed: ${MAX_VAULTS}\n` +
      `This limit helps prevent performance issues and resource exhaustion`;
    
    console.error(`Error: ${errorMessage}`);
    
    process.stdout.write(JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: ErrorCode.InvalidRequest,
        message: errorMessage
      },
      id: null
    }));
    
    process.exit(1);
  }

  console.error(`Validating ${vaultArgs.length} vault path${vaultArgs.length > 1 ? 's' : ''}...`);

  // Check if we have any valid paths
  if (normalizedPaths.length === 0) {
    const errorMessage = `No valid vault paths provided\n` +
      `Make sure at least one path points to a valid Obsidian vault`;
    
    console.error(`\nError: ${errorMessage}`);
    
    process.stdout.write(JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: ErrorCode.InvalidRequest,
        message: errorMessage
      },
      id: null
    }));
    
    process.exit(1);
  } else if (normalizedPaths.length < vaultArgs.length) {
    console.error(`\nWarning: Only ${normalizedPaths.length} out of ${vaultArgs.length} paths were valid`);
    console.error("Some vaults will not be available");
  }

  try {
    // Check for overlapping vault paths
    checkPathOverlap(normalizedPaths);
  } catch (error) {
    const errorMessage = error instanceof McpError ? error.message : String(error);
    console.error(`Error: ${errorMessage}`);
    
    process.stdout.write(JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: ErrorCode.InvalidRequest,
        message: errorMessage
      },
      id: null
    }));
    
    process.exit(1);
  }

  // Create vault configurations with human-friendly names
  console.error("\nInitializing vaults...");
  const vaults: VaultConfig[] = normalizedPaths.map(vaultPath => {
    // Get the last directory name from the path as the vault name
    const rawName = path.basename(vaultPath);
    const vaultName = sanitizeVaultName(rawName);
    
    // Log the vault name mapping for user reference
    console.error(`Vault "${rawName}" registered as "${vaultName}"`);
    
    return {
      name: vaultName,
      path: vaultPath
    };
  });

  // Ensure vault names are unique by appending numbers if needed
  const uniqueVaults: VaultConfig[] = [];
  const usedNames = new Set<string>();

  vaults.forEach(vault => {
    let uniqueName = vault.name;
    let counter = 1;
    
    // If name is already used, find a unique variant
    if (usedNames.has(uniqueName)) {
      console.error(`Note: Found duplicate vault name "${uniqueName}"`);
      while (usedNames.has(uniqueName)) {
        uniqueName = `${vault.name}-${counter}`;
        counter++;
      }
      console.error(`  → Using "${uniqueName}" instead`);
    }
    
    usedNames.add(uniqueName);
    uniqueVaults.push({
      name: uniqueName,
      path: vault.path
    });
  });

  // Log final vault configuration to stderr
  console.error("\nSuccessfully configured vaults:");
  uniqueVaults.forEach(vault => {
    console.error(`- ${vault.name}`);
    console.error(`  Path: ${vault.path}`);
  });
  console.error(`\nTotal vaults: ${uniqueVaults.length}`);
  console.error(""); // Empty line for readability

  try {
    if (uniqueVaults.length === 0) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'No valid Obsidian vaults provided. Please provide at least one valid vault path.\n\n' +
        'Example usage:\n' +
        '  obsidian-mcp ~/Documents/Obsidian/MyVault\n\n' +
        'The vault directory must:\n' +
        '- Exist and be accessible\n' +
        '- Contain a .obsidian directory (initialize by opening in Obsidian first)\n' +
        '- Have read/write permissions'
      );
    }

    console.error(`Starting Obsidian MCP Server with ${uniqueVaults.length} vault${uniqueVaults.length > 1 ? 's' : ''}...`);
    
    const server = new ObsidianServer(uniqueVaults);
    console.error("Server initialized successfully");

    // Handle graceful shutdown
    let isShuttingDown = false;
    async function shutdown(signal: string) {
      if (isShuttingDown) return;
      isShuttingDown = true;

      console.error(`\nReceived ${signal}, shutting down...`);
      try {
        await server.stop();
        console.error("Server stopped cleanly");
        process.exit(0);
      } catch (error) {
        console.error("Error during shutdown:", error);
        process.exit(1);
      }
    }

    // Register signal handlers
    process.on('SIGINT', () => shutdown('SIGINT')); // Ctrl+C
    process.on('SIGTERM', () => shutdown('SIGTERM')); // Kill command

    // Create vaults Map from unique vaults
    const vaultsMap = new Map(uniqueVaults.map(v => [v.name, v.path]));

    // Register tools with unique vault names
    const tools = [
      createCreateNoteTool(vaultsMap),
      createListAvailableVaultsTool(vaultsMap),
      createEditNoteTool(vaultsMap),
      createSearchVaultTool(vaultsMap),
      createMoveNoteTool(vaultsMap),
      createCreateDirectoryTool(vaultsMap),
      createDeleteNoteTool(vaultsMap),
      createAddTagsTool(vaultsMap),
      createRemoveTagsTool(vaultsMap),
      createRenameTagTool(vaultsMap),
      createReadNoteTool(vaultsMap)
    ];

    for (const tool of tools) {
      try {
        server.registerTool(tool);
      } catch (error) {
        console.error(`Error registering tool ${tool.name}:`, error);
        throw error;
      }
    }

    // All prompts are registered in the server constructor
    console.error("All tools registered successfully");
    console.error("Server starting...\n");

    // Start the server without logging to stdout
    await server.start();
  } catch (error) {
    console.log(error instanceof Error ? error.message : String(error));
    // Format error for MCP protocol
    const mcpError = error instanceof McpError ? error : new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : String(error)
    );

    // Write error in MCP protocol format to stdout
    process.stdout.write(JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: mcpError.code,
        message: mcpError.message
      },
      id: null
    }));

    // Log details to stderr for debugging
    console.error("\nFatal error starting server:");
    console.error(mcpError.message);
    if (error instanceof Error && error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack.split('\n').slice(1).join('\n'));
    }
    
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
