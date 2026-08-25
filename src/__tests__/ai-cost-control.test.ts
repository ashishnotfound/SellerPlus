import { describe, expect, it } from "vitest";
import { configuredCostUsd, maximumRequestCostMicros } from "@/lib/ai/pricing";
import { SingleFlight } from "@/lib/ai/single-flight";

describe("AI cost controls", () => {
  it("does not invent a provider cost when pricing is unavailable", () => {
    expect(configuredCostUsd({}, 1_000, 500)).toBeNull();
    expect(maximumRequestCostMicros({}, "test prompt", 2_048)).toBeNull();
  });

  it("reserves from configured input and output rates", () => {
    const pricing = { input_cost_per_million: 2, output_cost_per_million: 8 };
    expect(configuredCostUsd(pricing, 1_000_000, 500_000)).toBe(6);
    expect(maximumRequestCostMicros(pricing, "12345678", 1_000)).toBe(8_004);
  });

  it("identifies coalesced callers so only the executing request is charged", async () => {
    const singleFlight = new SingleFlight();
    let executions = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const operation = () => singleFlight.execute("tenant-scoped-key", async () => {
      executions += 1;
      await gate;
      return "result";
    });

    const first = operation();
    const second = operation();
    release?.();
    const [leader, follower] = await Promise.all([first, second]);

    expect(executions).toBe(1);
    expect(leader).toEqual({ value: "result", executed: true });
    expect(follower).toEqual({ value: "result", executed: false });
  });
});
