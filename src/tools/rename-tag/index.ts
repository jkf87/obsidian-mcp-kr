import { z } from "zod";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { promises as fs } from "fs";
import path from "path";
import {
  validateTag,
  normalizeTag,
  parseNote,
  stringifyNote
} from "../../utils/tags.js";
import {
  getAllMarkdownFiles,
  safeReadFile,
  fileExists
} from "../../utils/files.js";
import { createTool } from "../../utils/tool-factory.js";

// Input validation schema with descriptions
const schema = z.object({
  vault: z.string()
    .min(1, "Vault name cannot be empty")
    .describe("Name of the vault containing the tags"),
  oldTag: z.string()
    .min(1, "Old tag must not be empty")
    .refine(
      tag => /^[a-zA-Z0-9\/]+$/.test(tag),
      "Tags must contain only letters, numbers, and forward slashes. Do not include the # symbol. Examples: 'project', 'work/active', 'tasks/2024/q1'"
    )
    .describe("The tag to rename (without #). Example: 'project' or 'work/active'"),
  newTag: z.string()
    .min(1, "New tag must not be empty")
    .refine(
      tag => /^[a-zA-Z0-9\/]+$/.test(tag),
      "Tags must contain only letters, numbers, and forward slashes. Do not include the # symbol. Examples: 'project', 'work/active', 'tasks/2024/q1'"
    )
    .describe("The new tag name (without #). Example: 'projects' or 'work/current'"),
  createBackup: z.boolean()
    .default(true)
    .describe("Whether to create a backup before making changes (default: true)"),
  normalize: z.boolean()
    .default(true)
    .describe("Whether to normalize tag names (e.g., ProjectActive -> project-active) (default: true)"),
  batchSize: z.number()
    .min(1)
    .max(100)
    .default(50)
    .describe("Number of files to process in each batch (1-100) (default: 50)")
}).strict();

// Types
type RenameTagInput = z.infer<typeof schema>;

interface TagReplacement {
  oldTag: string;
  newTag: string;
}

interface TagChangeReport {
  filePath: string;
  oldTags: string[];
  newTags: string[];
  location: 'frontmatter' | 'content';
  line?: number;
}

interface RenameTagReport {
  successful: TagChangeReport[];
  failed: {
    filePath: string;
    error: string;
  }[];
  timestamp: string;
  backupCreated?: string;
}

/**
 * Creates a backup of the vault
 */
async function createVaultBackup(vaultPath: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(vaultPath, '.backup');
  const backupPath = path.join(backupDir, `vault-backup-${timestamp}`);

  await fs.mkdir(backupDir, { recursive: true });
  
  // Copy all markdown files to backup
  const files = await getAllMarkdownFiles(vaultPath);
  for (const file of files) {
    const relativePath = path.relative(vaultPath, file);
    const backupFile = path.join(backupPath, relativePath);
    await fs.mkdir(path.dirname(backupFile), { recursive: true });
    await fs.copyFile(file, backupFile);
  }

  return backupPath;
}

/**
 * Updates tags in frontmatter
 */
function updateFrontmatterTags(
  frontmatter: Record<string, any>,
  replacements: TagReplacement[],
  normalize: boolean
): {
  frontmatter: Record<string, any>;
  changes: { oldTag: string; newTag: string }[];
} {
  const changes: { oldTag: string; newTag: string }[] = [];
  const updatedFrontmatter = { ...frontmatter };
  
  if (!Array.isArray(frontmatter.tags)) {
    return { frontmatter: updatedFrontmatter, changes };
  }

  const updatedTags = frontmatter.tags.map(tag => {
    const normalizedTag = normalizeTag(tag, normalize);
    
    for (const { oldTag, newTag } of replacements) {
      const normalizedOldTag = normalizeTag(oldTag, normalize);
      
      if (normalizedTag === normalizedOldTag || 
          normalizedTag.startsWith(normalizedOldTag + '/')) {
        const updatedTag = normalizedTag.replace(
          new RegExp(`^${normalizedOldTag}`),
          normalizeTag(newTag, normalize)
        );
        changes.push({ oldTag: normalizedTag, newTag: updatedTag });
        return updatedTag;
      }
    }
    
    return normalizedTag;
  });

  updatedFrontmatter.tags = Array.from(new Set(updatedTags)).sort();
  return { frontmatter: updatedFrontmatter, changes };
}

/**
 * Updates inline tags in content
 */
function updateInlineTags(
  content: string,
  replacements: TagReplacement[],
  normalize: boolean
): {
  content: string;
  changes: { oldTag: string; newTag: string; line: number }[];
} {
  const changes: { oldTag: string; newTag: string; line: number }[] = [];
  const lines = content.split('\n');
  let inCodeBlock = false;
  let inHtmlComment = false;

  const updatedLines = lines.map((line, lineNum) => {
    // Handle code blocks and comments
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      return line;
    }
    if (line.includes('<!--')) inHtmlComment = true;
    if (line.includes('-->')) inHtmlComment = false;
    if (inCodeBlock || inHtmlComment) return line;

    // Update tags in regular content
    return line.replace(
      /(?<!`)#[a-zA-Z0-9][a-zA-Z0-9/]*(?!`)/g,
      (match) => {
        const tag = match.slice(1);
        const normalizedTag = normalizeTag(tag, normalize);

        for (const { oldTag, newTag } of replacements) {
          const normalizedOldTag = normalizeTag(oldTag, normalize);
          
          if (normalizedTag === normalizedOldTag ||
              normalizedTag.startsWith(normalizedOldTag + '/')) {
            const updatedTag = normalizedTag.replace(
              new RegExp(`^${normalizedOldTag}`),
              normalizeTag(newTag, normalize)
            );
            changes.push({
              oldTag: normalizedTag,
              newTag: updatedTag,
              line: lineNum + 1
            });
            return `#${updatedTag}`;
          }
        }

        return match;
      }
    );
  });

  return {
    content: updatedLines.join('\n'),
    changes
  };
}

/**
 * Updates saved searches and filters
 */
async function updateSavedSearches(
  vaultPath: string,
  replacements: TagReplacement[],
  normalize: boolean
): Promise<void> {
  const searchConfigPath = path.join(vaultPath, '.obsidian', 'search.json');
  
  if (!await fileExists(searchConfigPath)) return;

  try {
    const searchConfig = JSON.parse(
      await fs.readFile(searchConfigPath, 'utf-8')
    );

    let modified = false;
    
    // Update saved searches
    if (Array.isArray(searchConfig.savedSearches)) {
      searchConfig.savedSearches = searchConfig.savedSearches.map(
        (search: any) => {
          if (typeof search.query !== 'string') return search;

          let updatedQuery = search.query;
          for (const { oldTag, newTag } of replacements) {
            const normalizedOldTag = normalizeTag(oldTag, normalize);
            const normalizedNewTag = normalizeTag(newTag, normalize);
            
            // Update tag queries
            updatedQuery = updatedQuery.replace(
              new RegExp(`tag:${normalizedOldTag}(/\\S*)?`, 'g'),
              `tag:${normalizedNewTag}$1`
            );
            
            // Update raw tag references
            updatedQuery = updatedQuery.replace(
              new RegExp(`#${normalizedOldTag}(/\\S*)?`, 'g'),
              `#${normalizedNewTag}$1`
            );
          }

          if (updatedQuery !== search.query) {
            modified = true;
            return { ...search, query: updatedQuery };
          }
          return search;
        }
      );
    }

    if (modified) {
      await fs.writeFile(
        searchConfigPath,
        JSON.stringify(searchConfig, null, 2)
      );
    }
  } catch (error) {
    console.error('Error updating saved searches:', error);
    // Continue with other operations
  }
}

/**
 * Processes files in batches to handle large vaults
 */
async function processBatch(
  files: string[],
  start: number,
  batchSize: number,
  replacements: TagReplacement[],
  normalize: boolean
): Promise<{
  successful: TagChangeReport[];
  failed: { filePath: string; error: string }[];
}> {
  const batch = files.slice(start, start + batchSize);
  const successful: TagChangeReport[] = [];
  const failed: { filePath: string; error: string }[] = [];

  await Promise.all(
    batch.map(async (filePath) => {
      try {
        const content = await safeReadFile(filePath);
        if (!content) {
          failed.push({
            filePath,
            error: 'File not found or cannot be read'
          });
          return;
        }

        const parsed = parseNote(content);
        
        // Update frontmatter tags
        const { frontmatter: updatedFrontmatter, changes: frontmatterChanges } =
          updateFrontmatterTags(parsed.frontmatter, replacements, normalize);
        
        // Update inline tags
        const { content: updatedContent, changes: contentChanges } =
          updateInlineTags(parsed.content, replacements, normalize);

        // Only write file if changes were made
        if (frontmatterChanges.length > 0 || contentChanges.length > 0) {
          const updatedNote = stringifyNote({
            ...parsed,
            frontmatter: updatedFrontmatter,
            content: updatedContent
          });
          
          await fs.writeFile(filePath, updatedNote, 'utf-8');

          // Record changes
          if (frontmatterChanges.length > 0) {
            successful.push({
              filePath,
              oldTags: frontmatterChanges.map(c => c.oldTag),
              newTags: frontmatterChanges.map(c => c.newTag),
              location: 'frontmatter'
            });
          }

          if (contentChanges.length > 0) {
            successful.push({
              filePath,
              oldTags: contentChanges.map(c => c.oldTag),
              newTags: contentChanges.map(c => c.newTag),
              location: 'content',
              line: contentChanges[0].line
            });
          }
        }
      } catch (error) {
        failed.push({
          filePath,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    })
  );

  return { successful, failed };
}

/**
 * Renames tags throughout the vault while preserving hierarchies
 */
async function renameTag(
  vaultPath: string,
  params: Omit<RenameTagInput, 'vault'>
): Promise<RenameTagReport> {
  try {
    // Validate tags (though Zod schema already handles this)
    if (!validateTag(params.oldTag) || !validateTag(params.newTag)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid tag format'
      );
    }

    // Create backup if requested
    let backupPath: string | undefined;
    if (params.createBackup) {
      backupPath = await createVaultBackup(vaultPath);
    }

    // Get all markdown files
    const files = await getAllMarkdownFiles(vaultPath);
    
    // Process files in batches
    const successful: TagChangeReport[] = [];
    const failed: { filePath: string; error: string }[] = [];
    
    for (let i = 0; i < files.length; i += params.batchSize) {
      const { successful: batchSuccessful, failed: batchFailed } =
        await processBatch(
          files,
          i,
          params.batchSize,
          [{ oldTag: params.oldTag, newTag: params.newTag }],
          params.normalize
        );
      
      successful.push(...batchSuccessful);
      failed.push(...batchFailed);
    }

    // Update saved searches
    await updateSavedSearches(
      vaultPath,
      [{ oldTag: params.oldTag, newTag: params.newTag }],
      params.normalize
    );

    return {
      successful,
      failed,
      timestamp: new Date().toISOString(),
      backupCreated: backupPath
    };
  } catch (error) {
    // Ensure errors are properly propagated
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : 'Unknown error during tag renaming'
    );
  }
}

export function createRenameTagTool(vaults: Map<string, string>) {
  return createTool<RenameTagInput>({
    name: 'rename-tag',
    description: `Safely renames tags throughout the vault while preserving hierarchies.

Examples:
- Simple rename: { "oldTag": "project", "newTag": "projects" }
- Rename with hierarchy: { "oldTag": "work/active", "newTag": "projects/current" }
- With options: { "oldTag": "status", "newTag": "state", "normalize": true, "createBackup": true }
- INCORRECT: { "oldTag": "#project" } (don't include # symbol)`,
    schema,
    handler: async (args, vaultPath, _vaultName) => {
      const results = await renameTag(vaultPath, {
        oldTag: args.oldTag,
        newTag: args.newTag,
        createBackup: args.createBackup ?? true,
        normalize: args.normalize ?? true,
        batchSize: args.batchSize ?? 50
      });
      
      // Format response message
      let message = '';
      
      // Add backup info if created
      if (results.backupCreated) {
        message += `Created backup at: ${results.backupCreated}\n\n`;
      }
      
      // Add success summary
      if (results.successful.length > 0) {
        message += `Successfully renamed tags in ${results.successful.length} locations:\n\n`;
        
        // Group changes by file
        const changesByFile = results.successful.reduce((acc, change) => {
          if (!acc[change.filePath]) {
            acc[change.filePath] = [];
          }
          acc[change.filePath].push(change);
          return acc;
        }, {} as Record<string, typeof results.successful>);
        
        // Report changes for each file
        for (const [file, changes] of Object.entries(changesByFile)) {
          message += `${file}:\n`;
          changes.forEach(change => {
            const location = change.line 
              ? `${change.location} (line ${change.line})`
              : change.location;
            message += `  ${location}: ${change.oldTags.join(', ')} -> ${change.newTags.join(', ')}\n`;
          });
          message += '\n';
        }
      }
      
      // Add errors if any
      if (results.failed.length > 0) {
        message += 'Errors:\n';
        results.failed.forEach(error => {
          message += `  ${error.filePath}: ${error.error}\n`;
        });
      }

      return {
        content: [{
          type: 'text',
          text: message.trim()
        }]
      };
    }
  }, vaults);
}
