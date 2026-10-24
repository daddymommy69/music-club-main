import { describe, it, expect } from "vitest";
import {
  spotifyDescriptionSuffix,
  combineDropNotes,
  spotifyBlurbBudget,
  buildSpotifyDescription,
  SPOTIFY_DESCRIPTION_LIMIT,
} from "./spotifyDescription";

describe("spotifyDescriptionSuffix", () => {
  it("matches the drop's number", () => {
    expect(spotifyDescriptionSuffix(12)).toBe("Drop 12 | project music club");
  });
});

describe("combineDropNotes", () => {
  it("joins every note's text, oldest first, dropping blanks", () => {
    expect(
      combineDropNotes([{ text: "first thought" }, { text: "  " }, { text: "second thought" }])
    ).toBe("first thought · second thought");
  });

  it("returns empty string for no notes", () => {
    expect(combineDropNotes([])).toBe("");
  });
});

describe("spotifyBlurbBudget", () => {
  it("leaves exactly the limit minus the suffix and separator", () => {
    const suffix = spotifyDescriptionSuffix(3);
    expect(spotifyBlurbBudget(3)).toBe(SPOTIFY_DESCRIPTION_LIMIT - suffix.length - 3);
  });
});

describe("buildSpotifyDescription", () => {
  it("is just the suffix when there's no blurb yet", () => {
    expect(buildSpotifyDescription(5, "")).toBe("Drop 5 | project music club");
    expect(buildSpotifyDescription(5, "   ")).toBe("Drop 5 | project music club");
  });

  it("puts the blurb first, suffix after, when it fits", () => {
    expect(buildSpotifyDescription(5, "a cozy little mix for fall")).toBe(
      "a cozy little mix for fall | Drop 5 | project music club"
    );
  });

  it("truncates an over-budget blurb but never the suffix", () => {
    const longBlurb = "x".repeat(400);
    const result = buildSpotifyDescription(7, longBlurb);
    expect(result.length).toBeLessThanOrEqual(SPOTIFY_DESCRIPTION_LIMIT);
    expect(result.endsWith("Drop 7 | project music club")).toBe(true);
    expect(result).toContain("…");
  });
});
