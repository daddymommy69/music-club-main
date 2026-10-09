import { describe, it, expect } from "vitest";
import {
  getTop10Window,
  getTop10Phase,
  tallyTop10,
  shouldRevealVoteCounts,
  hitsPlaylistThreshold,
  TOP10_LAUNCHED_AT,
  GAP_HOURS,
  WINDOW_DAYS,
  PLAYLIST_THRESHOLD,
  REVEAL_MIN_VOTES,
  type Top10Vote,
} from "./top10";

const AFTER_LAUNCH = new Date(TOP10_LAUNCHED_AT.getTime() + 24 * 60 * 60 * 1000); // one day after launch
const BEFORE_LAUNCH = new Date(TOP10_LAUNCHED_AT.getTime() - 24 * 60 * 60 * 1000); // one day before launch

describe("getTop10Window", () => {
  it("is null when the drop hasn't shipped", () => {
    expect(getTop10Window({ publishedAt: null })).toBeNull();
  });

  it("is null for a drop shipped before Top 10 launched", () => {
    expect(getTop10Window({ publishedAt: BEFORE_LAUNCH })).toBeNull();
  });

  it("opens GAP_HOURS after publish and stays open for WINDOW_DAYS", () => {
    const window = getTop10Window({ publishedAt: AFTER_LAUNCH });
    expect(window).not.toBeNull();
    expect(window!.opensAt.getTime()).toBe(AFTER_LAUNCH.getTime() + GAP_HOURS * 60 * 60 * 1000);
    expect(window!.closesAt.getTime()).toBe(window!.opensAt.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);
  });
});

describe("getTop10Phase", () => {
  it("is not-shipped when there's no publish date", () => {
    expect(getTop10Phase({ publishedAt: null })).toBe("not-shipped");
  });

  it("is pending before the window opens", () => {
    const now = new Date(AFTER_LAUNCH.getTime() + 1 * 60 * 60 * 1000); // 1h in, window opens at 12h
    expect(getTop10Phase({ publishedAt: AFTER_LAUNCH }, now)).toBe("pending");
  });

  it("is open inside the window", () => {
    const now = new Date(AFTER_LAUNCH.getTime() + 24 * 60 * 60 * 1000); // 1 day in, well inside
    expect(getTop10Phase({ publishedAt: AFTER_LAUNCH }, now)).toBe("open");
  });

  it("is closed after the window ends", () => {
    const now = new Date(AFTER_LAUNCH.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days in
    expect(getTop10Phase({ publishedAt: AFTER_LAUNCH }, now)).toBe("closed");
  });
});

function vote(title: string | null, artist: string | null, link: string, submittedAt: Date): Top10Vote {
  return { title, artist, link, submittedAt };
}

describe("tallyTop10", () => {
  it("groups votes for the same title+artist into one row", () => {
    const t0 = new Date("2026-09-01T00:00:00Z");
    const t1 = new Date("2026-09-01T01:00:00Z");
    const tally = tallyTop10([
      vote("Song A", "Artist A", "https://open.spotify.com/track/a", t0),
      vote("Song A", "Artist A", "https://music.apple.com/track/a", t1),
    ]);
    expect(tally).toHaveLength(1);
    expect(tally[0].votes).toBe(2);
    expect(tally[0].earliestAt).toEqual(t0);
  });

  it("falls back to exact link matching when neither side has resolved metadata", () => {
    const t0 = new Date("2026-09-01T00:00:00Z");
    const t1 = new Date("2026-09-01T01:00:00Z");
    const tally = tallyTop10([
      vote(null, null, "https://open.spotify.com/track/unresolved", t0),
      vote(null, null, "https://open.spotify.com/track/unresolved", t1),
    ]);
    expect(tally).toHaveLength(1);
    expect(tally[0].votes).toBe(2);
  });

  it("does not merge two different unresolved links", () => {
    const t0 = new Date("2026-09-01T00:00:00Z");
    const tally = tallyTop10([
      vote(null, null, "https://open.spotify.com/track/one", t0),
      vote(null, null, "https://open.spotify.com/track/two", t0),
    ]);
    expect(tally).toHaveLength(2);
  });

  it("sorts by vote count descending, ties broken by earliest submission", () => {
    const earliest = new Date("2026-09-01T00:00:00Z");
    const later = new Date("2026-09-02T00:00:00Z");
    const latest = new Date("2026-09-03T00:00:00Z");
    const tally = tallyTop10([
      vote("Song B", "Artist B", "link-b", later),
      vote("Song A", "Artist A", "link-a", earliest),
      vote("Song C", "Artist C", "link-c", latest),
      vote("Song C", "Artist C", "link-c", latest),
    ]);
    // Song C has 2 votes (wins outright); A and B both have 1, A came in earlier.
    expect(tally.map((r) => r.title)).toEqual(["Song C", "Song A", "Song B"]);
  });
});

describe("shouldRevealVoteCounts", () => {
  it("is false for an empty tally", () => {
    expect(shouldRevealVoteCounts([])).toBe(false);
  });

  it(`is false if any row has fewer than ${REVEAL_MIN_VOTES} votes`, () => {
    const tally = tallyTop10([vote("A", "A", "a", new Date())]);
    expect(shouldRevealVoteCounts(tally)).toBe(false);
  });

  it(`is true once every row has at least ${REVEAL_MIN_VOTES} votes`, () => {
    const t = new Date();
    const tally = tallyTop10([vote("A", "A", "a", t), vote("A", "A", "a", t)]);
    expect(shouldRevealVoteCounts(tally)).toBe(true);
  });
});

describe("hitsPlaylistThreshold", () => {
  it(`is false below ${PLAYLIST_THRESHOLD} unique songs`, () => {
    const t = new Date();
    const tally = tallyTop10(
      Array.from({ length: PLAYLIST_THRESHOLD - 1 }, (_, i) => vote(`Song ${i}`, `Artist ${i}`, `link-${i}`, t))
    );
    expect(hitsPlaylistThreshold(tally)).toBe(false);
  });

  it(`is true at exactly ${PLAYLIST_THRESHOLD} unique songs`, () => {
    const t = new Date();
    const tally = tallyTop10(
      Array.from({ length: PLAYLIST_THRESHOLD }, (_, i) => vote(`Song ${i}`, `Artist ${i}`, `link-${i}`, t))
    );
    expect(hitsPlaylistThreshold(tally)).toBe(true);
  });
});
