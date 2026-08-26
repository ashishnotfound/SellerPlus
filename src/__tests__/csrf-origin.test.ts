import { describe, expect, it } from "vitest";
import { AuthError, requireSameOriginMutation } from "@/lib/auth-middleware";

describe("cookie-authenticated mutation origin checks", () => {
  it("allows same-origin browser mutations", () => {
    expect(() => requireSameOriginMutation(new Request("https://sellerplus.example/api/reyo-pack/pack", {
      method: "POST",
      headers: { host: "sellerplus.example", origin: "https://sellerplus.example" },
    }))).not.toThrow();
  });

  it("rejects cross-site browser mutations", () => {
    expect(() => requireSameOriginMutation(new Request("https://sellerplus.example/api/reyo-pack/pack", {
      method: "POST",
      headers: { host: "sellerplus.example", origin: "https://evil.example" },
    }))).toThrowError(new AuthError("Cross-site mutation rejected.", 403));
  });

  it("allows bearer-authenticated clients even when the browser origin differs", () => {
    expect(() => requireSameOriginMutation(new Request("https://sellerplus.example/api/reyo-pack/pack", {
      method: "POST",
      headers: {
        host: "sellerplus.example",
        origin: "https://scanner-device.example",
        authorization: "Bearer access-token",
      },
    }))).not.toThrow();
  });
});
