import { describe, it, expect } from "vitest";
import { dropCoverPath, DROP_COVER_CACHE_VERSION } from "./dropCoverPath";

describe("dropCoverPath", () => {
  it("includes the drop number and the current cache-busting version", () => {
    expect(dropCoverPath(3)).toBe(`/api/drops/3/cover?v=${DROP_COVER_CACHE_VERSION}`);
  });

  it("produces a different URL per drop number", () => {
    expect(dropCoverPath(1)).not.toBe(dropCoverPath(2));
  });
});
