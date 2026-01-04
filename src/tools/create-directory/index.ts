import { z } from "zod";
import { promises as fs } from "fs";
import path from "path";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { createTool } from "../../utils/tool-factory.js";

// Input validation schema with descriptions
const schema = z.object({
  vault: z.string()
    .min(1, "Vault name cannot be empty")
    .describe("Name of the vault where the directory should be created"),
  path: z.string()
    .min(1, "Directory path cannot be empty")
    .refine(dirPath => !path.isAbsolute(dirPath), 
      "Directory path must be relative to vault root")
    .describe("Path of the directory to create (relative to vault root)"),
  recursive: z.boolean()
    .optional()
    .default(true)
    .describe("Create parent directories if they don't exist")
}).strict();

type CreateDirectoryInput = z.infer<typeof schema>;

// Helper function to create directory
async function createDirectory(
  vaultPath: string,
  dirPath: string,
  recursive: boolean
): Promise<string> {
  const fullPath = path.join(vaultPath, dirPath);
  
  // Validate path is within vault
  const normalizedPath = path.normalize(fullPath);
  if (!normalizedPath.startsWith(path.normalize(vaultPath))) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      "Directory path must be within the vault directory"
    );
  }

  try {
    // Check if directory already exists
    try {
      await fs.access(normalizedPath);
      throw new McpError(
        ErrorCode.InvalidRequest,
        `A directory already exists at: ${normalizedPath}`
      );
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // Directory doesn't exist, proceed with creation
      await fs.mkdir(normalizedPath, { recursive });
      return normalizedPath;
    }
  } catch (error: any) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to create directory: ${error.message}`
    );
  }
}

export function createCreateDirectoryTool(vaults: Map<string, string>) {
  return createTool<CreateDirectoryInput>({
    name: "create-directory",
    description: "Create a new directory in the specified vault",
    schema,
    handler: async (args, vaultPath, _vaultName) => {
      const createdPath = await createDirectory(vaultPath, args.path, args.recursive ?? true);
      return {
        content: [
          {
            type: "text",
            text: `Successfully created directory at: ${createdPath}`
          }
        ]
      };
    }
  }, vaults);
}
