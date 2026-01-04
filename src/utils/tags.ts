import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

interface ParsedNote {
  frontmatter: Record<string, any>;
  content: string;
  hasFrontmatter: boolean;
}

interface TagChange {
  tag: string;
  location: 'frontmatter' | 'content';
  line?: number;
  context?: string;
}

interface TagRemovalReport {
  removedTags: TagChange[];
  preservedTags: TagChange[];
  errors: string[];
}

/**
 * Checks if tagA is a parent of tagB in a hierarchical structure
 */
export function isParentTag(parentTag: string, childTag: string): boolean {
  return childTag.startsWith(parentTag + '/');
}

/**
 * Matches a tag against a pattern
 * Supports * wildcard and hierarchical matching
 */
export function matchesTagPattern(pattern: string, tag: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\*/g, '.*')
    .replace(/\//g, '\\/');
  return new RegExp(`^${regexPattern}$`).test(tag);
}

/**
 * Gets all related tags (parent/child) for a given tag
 */
export function getRelatedTags(tag: string, allTags: string[]): {
  parents: string[];
  children: string[];
} {
  const parents: string[] = [];
  const children: string[] = [];
  
  const parts = tag.split('/');
  let current = '';
  
  // Find parents
  for (let i = 0; i < parts.length - 1; i++) {
    current = current ? `${current}/${parts[i]}` : parts[i];
    parents.push(current);
  }
  
  // Find children
  allTags.forEach(otherTag => {
    if (isParentTag(tag, otherTag)) {
      children.push(otherTag);
    }
  });
  
  return { parents, children };
}

/**
 * Validates a tag format
 * Allows: #tag, tag, tag/subtag, project/active
 * Disallows: empty strings, spaces, special characters except '/'
 */
export function validateTag(tag: string): boolean {
  // Remove leading # if present
  tag = tag.replace(/^#/, '');
  
  // Check if tag is empty
  if (!tag) return false;
  
  // Basic tag format validation
  const TAG_REGEX = /^[a-zA-Z0-9]+(\/[a-zA-Z0-9]+)*$/;
  return TAG_REGEX.test(tag);
}

/**
 * Normalizes a tag to a consistent format
 * Example: ProjectActive -> project-active
 */
export function normalizeTag(tag: string, normalize = true): string {
  // Remove leading # if present
  tag = tag.replace(/^#/, '');
  
  if (!normalize) return tag;
  
  // Convert camelCase/PascalCase to kebab-case
  return tag
    .split('/')
    .map(part => 
      part
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase()
    )
    .join('/');
}

/**
 * Parses a note's content into frontmatter and body
 */
export function parseNote(content: string): ParsedNote {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return {
      frontmatter: {},
      content: content,
      hasFrontmatter: false
    };
  }

  try {
    const frontmatter = parseYaml(match[1]);
    return {
      frontmatter: frontmatter || {},
      content: match[2],
      hasFrontmatter: true
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Invalid frontmatter YAML format'
    );
  }
}

/**
 * Combines frontmatter and content back into a note
 */
export function stringifyNote(parsed: ParsedNote): string {
  if (!parsed.hasFrontmatter || Object.keys(parsed.frontmatter).length === 0) {
    return parsed.content;
  }

  const frontmatterStr = stringifyYaml(parsed.frontmatter).trim();
  return `---\n${frontmatterStr}\n---\n\n${parsed.content.trim()}`;
}

/**
 * Extracts all tags from a note's content
 */
export function extractTags(content: string): string[] {
  const tags = new Set<string>();
  
  // Match hashtags that aren't inside code blocks or HTML comments
  const TAG_PATTERN = /(?<!`)#[a-zA-Z0-9][a-zA-Z0-9/]*(?!`)/g;
  
  // Split content into lines
  const lines = content.split('\n');
  let inCodeBlock = false;
  let inHtmlComment = false;
  
  for (const line of lines) {
    // Check for code block boundaries
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    
    // Check for HTML comment boundaries
    if (line.includes('<!--')) inHtmlComment = true;
    if (line.includes('-->')) inHtmlComment = false;
    
    // Skip if we're in a code block or HTML comment
    if (inCodeBlock || inHtmlComment) continue;
    
    // Extract tags from the line
    const matches = line.match(TAG_PATTERN);
    if (matches) {
      matches.forEach(tag => tags.add(tag.slice(1))); // Remove # prefix
    }
  }
  
  return Array.from(tags);
}

/**
 * Safely adds tags to frontmatter
 */
export function addTagsToFrontmatter(
  frontmatter: Record<string, any>,
  newTags: string[],
  normalize = true
): Record<string, any> {
  const updatedFrontmatter = { ...frontmatter };
  const existingTags = new Set(
    Array.isArray(frontmatter.tags) ? frontmatter.tags : []
  );
  
  for (const tag of newTags) {
    if (!validateTag(tag)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid tag format: ${tag}`
      );
    }
    existingTags.add(normalizeTag(tag, normalize));
  }
  
  updatedFrontmatter.tags = Array.from(existingTags).sort();
  return updatedFrontmatter;
}

/**
 * Safely removes tags from frontmatter with detailed reporting
 */
export function removeTagsFromFrontmatter(
  frontmatter: Record<string, any>,
  tagsToRemove: string[],
  options: {
    normalize?: boolean;
    preserveChildren?: boolean;
    patterns?: string[];
  } = {}
): {
  frontmatter: Record<string, any>;
  report: {
    removed: TagChange[];
    preserved: TagChange[];
  };
} {
  const {
    normalize = true,
    preserveChildren = false,
    patterns = []
  } = options;

  const updatedFrontmatter = { ...frontmatter };
  const existingTags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [];
  const removed: TagChange[] = [];
  const preserved: TagChange[] = [];

  // Get all related tags if preserving children
  const relatedTagsMap = new Map(
    tagsToRemove.map(tag => [
      tag,
      preserveChildren ? getRelatedTags(tag, existingTags) : null
    ])
  );

  const newTags = existingTags.filter(tag => {
    const normalizedTag = normalizeTag(tag, normalize);
    
    // Check if tag should be removed
    const shouldRemove = tagsToRemove.some(removeTag => {
      // Direct match
      if (normalizeTag(removeTag, normalize) === normalizedTag) return true;
      
      // Pattern match
      if (patterns.some(pattern => matchesTagPattern(pattern, normalizedTag))) {
        return true;
      }
      
      // Hierarchical match (if not preserving children)
      if (!preserveChildren) {
        const related = relatedTagsMap.get(removeTag);
        if (related?.parents.includes(normalizedTag)) return true;
      }
      
      return false;
    });

    if (shouldRemove) {
      removed.push({
        tag: normalizedTag,
        location: 'frontmatter'
      });
      return false;
    } else {
      preserved.push({
        tag: normalizedTag,
        location: 'frontmatter'
      });
      return true;
    }
  });

  updatedFrontmatter.tags = newTags.sort();
  return {
    frontmatter: updatedFrontmatter,
    report: { removed, preserved }
  };
}

/**
 * Removes inline tags from content with detailed reporting
 */
export function removeInlineTags(
  content: string,
  tagsToRemove: string[],
  options: {
    normalize?: boolean;
    preserveChildren?: boolean;
    patterns?: string[];
  } = {}
): {
  content: string;
  report: {
    removed: TagChange[];
    preserved: TagChange[];
  };
} {
  const {
    normalize = true,
    preserveChildren = false,
    patterns = []
  } = options;

  const removed: TagChange[] = [];
  const preserved: TagChange[] = [];
  
  // Process content line by line to track context
  const lines = content.split('\n');
  let inCodeBlock = false;
  let inHtmlComment = false;
  let modifiedLines = lines.map((line, lineNum) => {
    // Track code blocks and comments
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      return line;
    }
    if (line.includes('<!--')) inHtmlComment = true;
    if (line.includes('-->')) inHtmlComment = false;
    if (inCodeBlock || inHtmlComment) {
      // Preserve tags in code blocks and comments
      const tags = line.match(/(?<!`)#[a-zA-Z0-9][a-zA-Z0-9/]*(?!`)/g) || [];
      tags.forEach(tag => {
        preserved.push({
          tag: tag.slice(1),
          location: 'content',
          line: lineNum + 1,
          context: line.trim()
        });
      });
      return line;
    }

    // Process tags in regular content
    return line.replace(
      /(?<!`)#[a-zA-Z0-9][a-zA-Z0-9/]*(?!`)/g,
      (match) => {
        const tag = match.slice(1); // Remove # prefix
        const normalizedTag = normalizeTag(tag, normalize);
        
        const shouldRemove = tagsToRemove.some(removeTag => {
          // Direct match
          if (normalizeTag(removeTag, normalize) === normalizedTag) return true;
          
          // Pattern match
          if (patterns.some(pattern => matchesTagPattern(pattern, normalizedTag))) {
            return true;
          }
          
          // Hierarchical match (if not preserving children)
          if (!preserveChildren && isParentTag(removeTag, normalizedTag)) {
            return true;
          }
          
          return false;
        });

        if (shouldRemove) {
          removed.push({
            tag: normalizedTag,
            location: 'content',
            line: lineNum + 1,
            context: line.trim()
          });
          return '';
        } else {
          preserved.push({
            tag: normalizedTag,
            location: 'content',
            line: lineNum + 1,
            context: line.trim()
          });
          return match;
        }
      }
    );
  });

  // Clean up empty lines created by tag removal
  modifiedLines = modifiedLines.reduce((acc: string[], line: string) => {
    if (line.trim() === '') {
      if (acc[acc.length - 1]?.trim() === '') {
        return acc;
      }
    }
    acc.push(line);
    return acc;
  }, []);

  return {
    content: modifiedLines.join('\n'),
    report: { removed, preserved }
  };
}
