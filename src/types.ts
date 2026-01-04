import { z } from "zod";

// Tool types
export interface Tool<T = any> {
  name: string;
  description: string;
  inputSchema: {
    parse: (args: any) => T;
    jsonSchema: any;
  };
  handler: (args: T) => Promise<{
    content: {
      type: "text";
      text: string;
    }[];
  }>;
}

// Search types
export interface SearchMatch {
  line: number;
  text: string;
}

export interface SearchResult {
  file: string;
  content?: string;
  lineNumber?: number;
  matches?: SearchMatch[];
}

export interface SearchOperationResult {
  results: SearchResult[];
  totalResults?: number;
  totalMatches?: number;
  matchedFiles?: number;
  success?: boolean;
  message?: string;
}

export interface SearchOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
  maxResults?: number;
  path?: string;
  searchType?: 'content' | 'filename' | 'both';
}

// Tag types
export interface TagChange {
  tag: string;
  location: string;
}

// Prompt types
export interface Prompt<T = any> {
  name: string;
  description: string;
  arguments: {
    name: string;
    description: string;
    required?: boolean;
  }[];
  handler: (args: T, vaults: Map<string, string>) => Promise<PromptResult>;
}

export interface PromptMessage {
  role: "user" | "assistant";
  content: {
    type: "text";
    text: string;
  };
}

export interface ToolResponse {
  content: {
    type: "text";
    text: string;
  }[];
}

export interface OperationResult {
  success: boolean;
  message: string;
  details?: Record<string, any>;
}

export interface BatchOperationResult {
  success: boolean;
  message: string;
  totalCount: number;
  successCount: number;
  failedItems: Array<{
    item: string;
    error: string;
  }>;
}

export interface FileOperationResult {
  success: boolean;
  message: string;
  operation: 'create' | 'edit' | 'delete' | 'move';
  path: string;
}

export interface TagOperationResult {
  success: boolean;
  message: string;
  totalCount: number;
  successCount: number;
  details: Record<string, {
    changes: TagChange[];
  }>;
  failedItems: Array<{
    item: string;
    error: string;
  }>;
}

export interface PromptResult {
  systemPrompt?: string;
  messages: PromptMessage[];
  _meta?: {
    [key: string]: any;
  };
}
