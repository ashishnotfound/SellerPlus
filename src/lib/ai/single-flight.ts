/**
 * SellerPlus OS — AI Single Flight Request Coalescing
 * 
 * Ensures concurrent duplicate AI requests share a single execution thread,
 * minimizing API token overhead and downstream cost spikes.
 */

export class SingleFlight {
  private active = new Map<string, Promise<unknown>>();

  /**
   * Coalesces concurrent calls to 'fn' sharing the same 'key'.
   */
  async execute<T>(key: string, fn: () => Promise<T>): Promise<{ value: T; executed: boolean }> {
    const existing = this.active.get(key);
    if (existing) {
      return { value: await (existing as Promise<T>), executed: false };
    }

    const promise = fn().finally(() => {
      this.active.delete(key);
    });

    this.active.set(key, promise);
    return { value: await promise, executed: true };
  }
}

export const singleFlight = new SingleFlight();
