import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

/**
 * Wraps common file system errors into McpErrors
 */
export function handleFsError(error: unknown, operation: string): never {
  if (error instanceof McpError) {
    throw error;
  }

  if (error instanceof Error) {
    const nodeError = error as NodeJS.ErrnoException;
    
    switch (nodeError.code) {
      case 'ENOENT':
        throw new McpError(
          ErrorCode.InvalidRequest,
          `File or directory not found: ${nodeError.message}`
        );
      case 'EACCES':
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Permission denied: ${nodeError.message}`
        );
      case 'EEXIST':
        throw new McpError(
          ErrorCode.InvalidRequest,
          `File or directory already exists: ${nodeError.message}`
        );
      case 'ENOSPC':
        throw new McpError(
          ErrorCode.InternalError,
          'Not enough space to write file'
        );
      default:
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to ${operation}: ${nodeError.message}`
        );
    }
  }

  throw new McpError(
    ErrorCode.InternalError,
    `Unexpected error during ${operation}`
  );
}

/**
 * Handles Zod validation errors by converting them to McpErrors
 */
export function handleZodError(error: z.ZodError): never {
  throw new McpError(
    ErrorCode.InvalidRequest,
    `Invalid arguments: ${error.errors.map(e => e.message).join(", ")}`
  );
}

/**
 * Creates a standardized error for when a note already exists
 */
export function createNoteExistsError(path: string): McpError {
  return new McpError(
    ErrorCode.InvalidRequest,
    `A note already exists at: ${path}\n\n` +
    'To prevent accidental modifications, this operation has been cancelled.\n' +
    'If you want to modify an existing note, please explicitly request to edit or replace it.'
  );
}

/**
 * Creates a standardized error for when a note is not found
 */
export function createNoteNotFoundError(path: string): McpError {
  return new McpError(
    ErrorCode.InvalidRequest,
    `Note "${path}" not found in vault`
  );
}
