export interface CircuitBreakerOptions {
  failureThreshold: number; // number of failures before opening
  cooldownMs: number; // how long to wait before half-open state
}

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failureCount: number = 0;
  private nextAttemptAt: number = 0;
  private options: CircuitBreakerOptions;
  public name: string;

  constructor(name: string, options: CircuitBreakerOptions = { failureThreshold: 3, cooldownMs: 30000 }) {
    this.name = name;
    this.options = options;
  }

  public async execute<T>(action: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() > this.nextAttemptAt) {
        // Transition to half-open: try exactly one request to see if the service has recovered
        this.state = "HALF_OPEN";
      } else {
        throw new Error(`Circuit breaker [${this.name}] is OPEN. Service is unavailable.`);
      }
    }

    try {
      const result = await action();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failureCount = 0;
    this.state = "CLOSED";
  }

  private onFailure() {
    this.failureCount++;
    if (this.failureCount >= this.options.failureThreshold) {
      this.state = "OPEN";
      this.nextAttemptAt = Date.now() + this.options.cooldownMs;
      console.error(`Circuit breaker [${this.name}] tripped! Opening for ${this.options.cooldownMs}ms.`);
    }
  }

  public getState() {
    return this.state;
  }
}

// Global registry for circuit breakers
export const Breakers = {
  AmazonSPAPI: new CircuitBreaker("AmazonSPAPI", { failureThreshold: 5, cooldownMs: 60000 }),
  OpenAI: new CircuitBreaker("OpenAI", { failureThreshold: 3, cooldownMs: 30000 }),
};
