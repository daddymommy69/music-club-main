import { describe, it, expect } from "vitest";
import { sameSongByTitleArtist } from "./songMatch";

describe("sameSongByTitleArtist", () => {
  it("matches identical title+artist", () => {
    expect(sameSongByTitleArtist("Midnight", "The Band", "Midnight", "The Band")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(sameSongByTitleArtist("MIDNIGHT", "the band", "midnight", "THE BAND")).toBe(true);
  });

  it("is whitespace-insensitive", () => {
    expect(sameSongByTitleArtist("  Midnight ", "The Band  ", "Midnight", " The Band")).toBe(true);
  });

  it("does not match a different title", () => {
    expect(sameSongByTitleArtist("Midnight", "The Band", "Daylight", "The Band")).toBe(false);
  });

  it("does not match a different artist", () => {
    expect(sameSongByTitleArtist("Midnight", "The Band", "Midnight", "Someone Else")).toBe(false);
  });

  it("never matches when either side is missing title or artist", () => {
    expect(sameSongByTitleArtist(null, "The Band", "Midnight", "The Band")).toBe(false);
    expect(sameSongByTitleArtist("Midnight", null, "Midnight", "The Band")).toBe(false);
    expect(sameSongByTitleArtist("Midnight", "The Band", undefined, "The Band")).toBe(false);
    expect(sameSongByTitleArtist("Midnight", "The Band", "Midnight", undefined)).toBe(false);
    expect(sameSongByTitleArtist(null, null, null, null)).toBe(false);
  });
});
