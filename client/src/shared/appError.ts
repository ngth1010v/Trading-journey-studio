export class AppError extends Error {
  public readonly code: string;

  constructor(code: string, msg: string) {
    super(msg);
    this.name = "AppError";
    this.code = code;
  }
}

export function throwAppError(code: string, msg: string): never {
  throw new AppError(code, msg);
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
