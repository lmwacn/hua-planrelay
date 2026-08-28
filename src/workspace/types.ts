/** Public types for the read-only workspace gateway. */

export interface WorkspaceOptions {
  /** Workspace root. It must exist and be a directory. */
  root: string;
  /** Keep the default least-privilege mode enabled unless explicitly disabled. */
  trackedFilesOnly?: boolean;
  /** Optional path to an ignore file, relative to the workspace root. */
  ignoreFile?: string;
  maxReadBytes?: number;
  maxReadLines?: number;
  maxSearchFiles?: number;
  maxSearchResults?: number;
  maxSearchFileBytes?: number;
  searchTimeoutMs?: number;
}

export interface DirectoryEntry {
  path: string;
  name: string;
  kind: "file" | "directory";
  size?: number;
}

export interface DirectoryPage {
  path: string;
  entries: DirectoryEntry[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface ReadFileOptions {
  startLine?: number;
  endLine?: number;
  maxBytes?: number;
  maxLines?: number;
}

export interface ReadFileResult {
  path: string;
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  truncated: boolean;
  bytes: number;
}

export interface SearchOptions {
  path?: string;
  regex?: boolean;
  caseSensitive?: boolean;
  maxResults?: number;
  maxFiles?: number;
  maxFileBytes?: number;
  timeoutMs?: number;
}

export interface SearchMatch {
  path: string;
  line: number;
  column: number;
  text: string;
}

export interface SearchResult {
  query: string;
  matches: SearchMatch[];
  filesScanned: number;
  truncated: boolean;
  engine: "node" | "rg";
}
