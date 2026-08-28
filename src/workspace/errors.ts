export class WorkspaceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "WorkspaceError";
    this.code = code;
  }
}

export function invalidPath(message: string): never {
  throw new WorkspaceError("INVALID_PATH", message);
}

export function deniedPath(message: string): never {
  throw new WorkspaceError("PATH_DENIED", message);
}
