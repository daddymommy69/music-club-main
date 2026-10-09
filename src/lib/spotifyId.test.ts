import { describe, it, expect } from "vitest";
import { spotifyTrackIdFromUri } from "./spotifyId";

describe("spotifyTrackIdFromUri", () => {
  it("pulls the bare id out of a well-formed track URI", () => {
    expect(spotifyTrackIdFromUri("spotify:track:4cOdK2wGLETKBW3PvgPWqT")).toBe("4cOdK2wGLETKBW3PvgPWqT");
  });

  it("returns null for null/undefined/empty", () => {
    expect(spotifyTrackIdFromUri(null)).toBeNull();
    expect(spotifyTrackIdFromUri(undefined)).toBeNull();
    expect(spotifyTrackIdFromUri("")).toBeNull();
  });

  it("returns null for a non-track URI (e.g. an album or artist)", () => {
    expect(spotifyTrackIdFromUri("spotify:album:4cOdK2wGLETKBW3PvgPWqT")).toBeNull();
    expect(spotifyTrackIdFromUri("spotify:artist:4cOdK2wGLETKBW3PvgPWqT")).toBeNull();
  });

  it("returns null for a plain URL, not a URI", () => {
    expect(spotifyTrackIdFromUri("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT")).toBeNull();
  });

  it("returns null for a malformed/truncated URI", () => {
    expect(spotifyTrackIdFromUri("spotify:track:")).toBeNull();
    expect(spotifyTrackIdFromUri("spotify:track")).toBeNull();
    expect(spotifyTrackIdFromUri("spotify:track:has a space")).toBeNull();
  });
});
