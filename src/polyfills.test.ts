import { describe, expect, it } from "vitest";
import { parseUrl, withResolvers } from "./polyfills";

describe("boot polyfills", () => {
  it("settles like Promise.withResolvers", async () => {
    const deferred = withResolvers<number>();
    deferred.resolve(3);
    await expect(deferred.promise).resolves.toBe(3);

    const failed = withResolvers<number>();
    failed.reject(new Error("boom"));
    await expect(failed.promise).rejects.toThrow("boom");
  });

  it("returns null for an unparseable URL", () => {
    expect(parseUrl("/doc", "https://example.com")?.pathname).toBe("/doc");
    expect(parseUrl("http://[")).toBeNull();
  });
});
