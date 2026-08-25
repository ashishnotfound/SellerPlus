import { AsyncLocalStorage } from "node:async_hooks";

export interface AIRequestContext {
  userId: string;
  workspaceId: string;
  feature: string;
}

const storage = new AsyncLocalStorage<AIRequestContext>();

export function runWithAIRequestContext<T>(
  context: AIRequestContext,
  operation: () => T,
): T {
  return storage.run(context, operation);
}

export function getAIRequestContext(): AIRequestContext | undefined {
  return storage.getStore();
}
