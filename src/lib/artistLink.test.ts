import { describe, it, expect } from "vitest";
import { artistHref, artistHrefForSpotifyResult } from "./artistLink";

describe("artistHref", () => {
  it("builds a path from the normalized (lowercased, trimmed) name", () => {
    expect(artistHref("Tame Impala")).toBe("/artist/tame%20impala");
  });

  it("carries no query string", () => {
    expect(artistHref("Tame Impala")).not.toContain("?");
  });

  it("normalizes two different casings/spacings to the same path", () => {
    expect(artistHref("tame impala")).toBe(artistHref(" Tame Impala "));
  });
});

describe("artistHrefForSpotifyResult", () => {
  it("points at the same path artistHref would, plus hint query params", () => {
    const href = artistHrefForSpotifyResult("Tame Impala", "5INjqkS1o8h1imAzPqGZBb");
    expect(href.startsWith(artistHref("Tame Impala") + "?")).toBe(true);
  });

  it("includes the real-cased name as a hint", () => {
    const href = artistHrefForSpotifyResult("Tame Impala", null);
    const qs = new URLSearchParams(href.split("?")[1]);
    expect(qs.get("name")).toBe("Tame Impala");
  });

  it("includes the Spotify artist id as sid when given", () => {
    const href = artistHrefForSpotifyResult("Tame Impala", "5INjqkS1o8h1imAzPqGZBb");
    const qs = new URLSearchParams(href.split("?")[1]);
    expect(qs.get("sid")).toBe("5INjqkS1o8h1imAzPqGZBb");
  });

  it("omits sid entirely when there's no artist id to hint with", () => {
    const href = artistHrefForSpotifyResult("Tame Impala", null);
    const qs = new URLSearchParams(href.split("?")[1]);
    expect(qs.has("sid")).toBe(false);

    const hrefUndefined = artistHrefForSpotifyResult("Tame Impala", undefined);
    const qsUndefined = new URLSearchParams(hrefUndefined.split("?")[1]);
    expect(qsUndefined.has("sid")).toBe(false);
  });
});
