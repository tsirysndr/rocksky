export class RockskyError extends Error {
  readonly cause?: unknown;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "RockskyError";
    this.cause = options?.cause;
  }
}

export class RockskyHttpError extends RockskyError {
  readonly status: number;
  readonly statusText: string;
  readonly url: string;
  readonly body: unknown;

  constructor(args: {
    status: number;
    statusText: string;
    url: string;
    body: unknown;
    message?: string;
  }) {
    const message =
      args.message ??
      `Rocksky API ${args.status} ${args.statusText} at ${args.url}`;
    super(message);
    this.name = "RockskyHttpError";
    this.status = args.status;
    this.statusText = args.statusText;
    this.url = args.url;
    this.body = args.body;
  }
}

export class RockskyTimeoutError extends RockskyError {
  constructor(ms: number) {
    super(`Rocksky request timed out after ${ms}ms`);
    this.name = "RockskyTimeoutError";
  }
}

export class RockskyAuthError extends RockskyError {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "RockskyAuthError";
  }
}
