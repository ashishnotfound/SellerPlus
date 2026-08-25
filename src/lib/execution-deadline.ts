export class ExecutionDeadlineError extends Error {
  readonly code = "EXECUTION_DEADLINE_REACHED";

  constructor(message = "The execution deadline was reached before the operation could finish.") {
    super(message);
    this.name = "ExecutionDeadlineError";
  }
}

export interface ExecutionBoundary {
  deadlineAt?: number;
  signal?: AbortSignal;
}

export function assertExecutionActive(
  boundary: ExecutionBoundary,
  reserveMs = 0,
): void {
  if (boundary.signal?.aborted) {
    throw new ExecutionDeadlineError();
  }
  if (
    boundary.deadlineAt !== undefined &&
    Date.now() + Math.max(0, reserveMs) >= boundary.deadlineAt
  ) {
    throw new ExecutionDeadlineError();
  }
}

export function boundedTimeoutMs(
  boundary: ExecutionBoundary,
  maximumMs: number,
  reserveMs = 250,
): number {
  assertExecutionActive(boundary, reserveMs);
  if (boundary.deadlineAt === undefined) return Math.max(1, Math.floor(maximumMs));
  return Math.max(
    1,
    Math.floor(Math.min(maximumMs, boundary.deadlineAt - Date.now() - reserveMs)),
  );
}

export function createRequestSignal(
  boundary: ExecutionBoundary,
  maximumMs: number,
): AbortSignal {
  const timeout = AbortSignal.timeout(boundedTimeoutMs(boundary, maximumMs));
  return boundary.signal ? AbortSignal.any([boundary.signal, timeout]) : timeout;
}

export async function abortableDelay(
  delayMs: number,
  boundary: ExecutionBoundary,
  reserveMs = 250,
): Promise<void> {
  const delay = Math.max(0, Math.floor(delayMs));
  assertExecutionActive(boundary, delay + reserveMs);

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      boundary.signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delay);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new ExecutionDeadlineError());
    };
    boundary.signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function runBeforeDeadline<T>(
  operation: () => Promise<T>,
  deadlineAt: number,
  controller: AbortController,
): Promise<T> {
  assertExecutionActive({ deadlineAt, signal: controller.signal });
  return new Promise<T>((resolve, reject) => {
    const timeoutMs = Math.max(1, deadlineAt - Date.now());
    const timer = setTimeout(() => {
      controller.abort(new ExecutionDeadlineError());
      reject(new ExecutionDeadlineError());
    }, timeoutMs);

    operation().then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
