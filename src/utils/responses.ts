import {
  ToolResponse,
  OperationResult,
  BatchOperationResult,
  FileOperationResult,
  TagOperationResult,
  SearchOperationResult,
  TagChange,
  SearchResult
} from '../types.js';

/**
 * Creates a standardized tool response
 */
export function createToolResponse(message: string): ToolResponse {
  return {
    content: [{
      type: "text",
      text: message
    }]
  };
}

/**
 * Formats a basic operation result
 */
export function formatOperationResult(result: OperationResult): string {
  const parts: string[] = [];
  
  // Add main message
  parts.push(result.message);
  
  // Add details if present
  if (result.details) {
    parts.push('\nDetails:');
    Object.entries(result.details).forEach(([key, value]) => {
      parts.push(`  ${key}: ${JSON.stringify(value)}`);
    });
  }
  
  return parts.join('\n');
}

/**
 * Formats a batch operation result
 */
export function formatBatchResult(result: BatchOperationResult): string {
  const parts: string[] = [];
  
  // Add summary
  parts.push(result.message);
  parts.push(`\nProcessed ${result.totalCount} items: ${result.successCount} succeeded`);
  
  // Add failures if any
  if (result.failedItems.length > 0) {
    parts.push('\nErrors:');
    result.failedItems.forEach(({ item, error }) => {
      parts.push(`  ${item}: ${error}`);
    });
  }
  
  return parts.join('\n');
}

/**
 * Formats a file operation result
 */
export function formatFileResult(result: FileOperationResult): string {
  const operationText = {
    create: 'Created',
    edit: 'Modified',
    delete: 'Deleted',
    move: 'Moved'
  }[result.operation];
  
  return `${operationText} file: ${result.path}\n${result.message}`;
}

/**
 * Formats tag changes for reporting
 */
function formatTagChanges(changes: TagChange[]): string {
  const byLocation = changes.reduce((acc, change) => {
    if (!acc[change.location]) acc[change.location] = new Set();
    acc[change.location].add(change.tag);
    return acc;
  }, {} as Record<string, Set<string>>);
  
  const parts: string[] = [];
  for (const [location, tags] of Object.entries(byLocation)) {
    parts.push(`  ${location}: ${Array.from(tags).join(', ')}`);
  }
  
  return parts.join('\n');
}

/**
 * Formats a tag operation result
 */
export function formatTagResult(result: TagOperationResult): string {
  const parts: string[] = [];
  
  // Add summary
  parts.push(result.message);
  parts.push(`\nProcessed ${result.totalCount} files: ${result.successCount} modified`);
  
  // Add detailed changes
  for (const [filename, fileDetails] of Object.entries(result.details)) {
    if (fileDetails.changes.length > 0) {
      parts.push(`\nChanges in ${filename}:`);
      parts.push(formatTagChanges(fileDetails.changes));
    }
  }
  
  // Add failures if any
  if (result.failedItems.length > 0) {
    parts.push('\nErrors:');
    result.failedItems.forEach(({ item, error }) => {
      parts.push(`  ${item}: ${error}`);
    });
  }
  
  return parts.join('\n');
}

/**
 * Formats search results
 */
export function formatSearchResult(result: SearchOperationResult): string {
  const parts: string[] = [];
  
  // Add summary
  parts.push(
    `Found ${result.totalMatches} match${result.totalMatches === 1 ? '' : 'es'} ` +
    `in ${result.matchedFiles} file${result.matchedFiles === 1 ? '' : 's'}`
  );
  
  if (result.results.length === 0) {
    return 'No matches found.';
  }
  
  // Separate filename and content matches
  const filenameMatches = result.results.filter(r => r.matches?.some(m => m.line === 0));
  const contentMatches = result.results.filter(r => r.matches?.some(m => m.line !== 0));
  
  // Add filename matches if any
  if (filenameMatches.length > 0) {
    parts.push('\nFilename matches:');
    filenameMatches.forEach(result => {
      parts.push(`  ${result.file}`);
    });
  }
  
  // Add content matches if any
  if (contentMatches.length > 0) {
    parts.push('\nContent matches:');
    contentMatches.forEach(result => {
      parts.push(`\nFile: ${result.file}`);
      result.matches
        ?.filter(m => m?.line !== 0) // Skip filename matches
        ?.forEach(m => m && parts.push(`  Line ${m.line}: ${m.text}`));
    });
  }
  
  return parts.join('\n');
}

/**
 * Creates a standardized error response
 */
export function createErrorResponse(error: Error): ToolResponse {
  return createToolResponse(`Error: ${error.message}`);
}
