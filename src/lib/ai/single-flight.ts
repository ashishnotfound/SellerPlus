/**
 * SellerPlus OS — AI Single Flight Request Coalescing
 * 
 * Ensures concurrent duplicate AI requests share a single execution thread,
 * minimizing API token overhead and downstream cost spikes.
 */

export class SingleFlight {
  private active = new Map<string, Promise<any>>();

  /**
   * Coalesces concurrent calls to 'fn' sharing the same 'key'.
   */
  async execute<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.active.get(key);
    if (existing) {
      console.log(`[SingleFlight] Coalescing duplicate request key: ${key.substring(0, 10)}...`);
      return existing as Promise<T>;
    }

    const promise = fn().finally(() => {
      this.active.delete(key);
    });

    this.active.set(key, promise);
    return promise;
  }
}

export const singleFlight = new SingleFlight();
