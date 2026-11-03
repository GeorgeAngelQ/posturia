export class AgentTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`Timeout de ${ms} ms en ${label}`);
    this.name = "AgentTimeoutError";
  }
}

export class DeadlineExceededError extends Error {
  constructor() {
    super("Se agotó el tiempo total asignado a los agentes");
    this.name = "DeadlineExceededError";
  }
}

export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AgentTimeoutError(label, ms));
    }, ms);
  });
  try {
    return await Promise.race([fn(controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  shouldRetry?: (error: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  const sleep = opts.sleep ?? realSleep;
  let lastError: unknown;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === opts.retries) break;
      if (opts.shouldRetry && !opts.shouldRetry(error)) break;
      await sleep(opts.baseDelayMs * 2 ** attempt);
    }
  }
  throw lastError;
}
