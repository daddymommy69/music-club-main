import Link from "next/link";
import type { PublicDropDetail, PublicSongRow } from "@/lib/archive";
import { formatDropMonth } from "@/lib/format";
import { artistHref } from "@/lib/artistLink";
import CloseButton from "./CloseButton";
import DropTile from "./DropTile";
import PlayableArt from "./PlayableArt";
import { PlayQueue, type QueueSong } from "./NowPlayingProvider";
import PlayDropButton from "./PlayDropButton";
import ShareButton from "./ShareButton";
import LikeButton from "./LikeButton";
import SongRatingControl from "./SongRatingControl";
import DropLikeButton from "./DropLikeButton";
import DropSaveButton from "./DropSaveButton";
import RateDropControl from "./RateDropControl";
import RoleName from "./RoleName";
import InfoTip from "./InfoTip";

export default function DropDetail({
  drop,
  closable,
  shareUrl,
  likedSongIds,
  viewerRating,
  viewerDropLiked,
  viewerDropSaved,
  viewerSongRatings,
}: {
  drop: PublicDropDetail;
  closable?: boolean;
  /** A real, absolute, clickable URL — src/lib/site.ts's siteUrl(),
   * never siteDisplayPath() (that one's display-text-only by its own
   * comment) — fed straight into ShareButton's native share/clipboard
   * flow below. */
  shareUrl: string;
  /** Song ids the current viewer has liked — empty for a logged-out
   * visitor (LikeButton still works for them; see its own comment). */
  likedSongIds?: number[];
  /** The current viewer's own rating for this drop, or null if they
   * haven't rated it (or aren't logged in — RateDropControl handles
   * that case itself on click). */
  viewerRating?: number | null;
  /** Whether the current viewer has liked/saved this whole drop — false
   * for a logged-out visitor, same spirit as likedSongIds above
   * (DropLikeButton/DropSaveButton still work for them). */
  viewerDropLiked?: boolean;
  viewerDropSaved?: boolean;
  /** The current viewer's own per-song ratings, keyed by songId — empty
   * for a logged-out visitor, same spirit as likedSongIds above
   * (SongRatingControl still works for them; see its own comment). */
  viewerSongRatings?: Record<number, number>;
}) {
  // Same "skip songs with no artwork rather than leave a gap" selection
  // as the archive tile's artworkUrls (src/lib/archive.ts) — carrying
  // each quadrant's artist along too now, so the hero tile's quadrants
  // can each link to their own artist page (2026-10-07 — see
  // claude/next-build.md).
  const heroSongs = drop.songs.filter((s) => s.artworkUrl).slice(0, 4);
  const artworkUrls = heroSongs.map((s) => s.artworkUrl as string);
  const quadrantArtists = heroSongs.map((s) => s.artist);

  const likedSet = new Set(likedSongIds ?? []);
  const songRatings = viewerSongRatings ?? {};

  // Listener Picks no longer show on this page at all (2026-10
  // release-page redesign — see claude/next-build.md): they moved to
  // their own dedicated /drop/[num]/listener-picks page, reached from
  // the /releases archive card. This tracklist is always just the
  // Curator Picks now, same single unheaded list every drop had before
  // Listener Picks existed — drop.songs itself is unchanged (still
  // every song, both pick types) since other callers of getPublicDrop
  // (e.g. the listener-picks page) need the full set.
  const curatorSongs = drop.songs.filter((s) => s.pickType === "curator");

  // Same mapping Tracklist's own <PlayQueue> below builds — kept here too
  // so the new primary Play button (design-pass round, 2026-10-09 — see
  // claude/next-build.md) can start that exact queue without waiting for
  // a track click first.
  const queueSongs: QueueSong[] = curatorSongs.map((s) => ({
    songId: s.id,
    spotifyUri: s.spotifyUri,
    artworkUrl: s.artworkUrl,
    title: s.title,
    artist: s.artist,
  }));

  return (
    <div className="drop-detail">
      <div className="top-row">
        <DropTile
          num={drop.num}
          artworkUrls={artworkUrls}
          quadrantArtists={quadrantArtists}
          hero
          framed={false}
        />
        {closable && <CloseButton />}
      </div>
      <div className="drop-title">{drop.title ?? `Drop ${drop.num}`}</div>
      <div className="mut" style={{ fontSize: 11 }}>
        {formatDropMonth(drop.publishedAt)} · {curatorSongs.length}{" "}
        {curatorSongs.length === 1 ? "song" : "songs"}
      </div>

      {/* Play + Spotify side by side, half-width each (2026-10-15 —
          founder's own ask: Play alone felt too big/heavy as the one
          full-width action, and a Spotify button belongs right next to
          it rather than buried further down). Spotify-only here (no
          Apple Music button — the founder's own call, "lets leave that
          out") — Apple still gets its own link below when a drop has
          one, see the conditional .listen-row further down. When a
          drop has no Spotify playlist yet, Play just flexes to fill the
          row on its own. */}
      <div className="listen-row-primary">
        <PlayDropButton songs={queueSongs} />
        {drop.spotifyUrl && (
          <a className="btn btn-outline open-spotify-btn" href={drop.spotifyUrl} target="_blank" rel="noreferrer">
            Spotify ↗
          </a>
        )}
      </div>

      {/* Apple Music only now — Spotify moved into the primary row above,
          so keeping it here too would just be a second "open Spotify"
          button on the same page (founder's own call, 2026-10-15). Still
          renders nothing for a drop with no Apple link, same as before. */}
      {drop.appleUrl && (
        <div className="listen-row">
          <a className="btn btn-outline" href={drop.appleUrl} target="_blank" rel="noreferrer">
            Apple Music ↗
          </a>
        </div>
      )}

      {/* Share/Save/Like unified into one row of same-size pills
          (2026-10-15 — founder's own ask) — Share used to sit alone on
          its own line above everything else, disconnected from the
          other two "do something with this drop" actions. */}
      <div className="drop-controls-row">
        <ShareButton url={shareUrl} title={drop.title ?? `Drop ${drop.num}`} />
        <DropSaveButton dropId={drop.id} initialSaved={viewerDropSaved ?? false} />
        <DropLikeButton
          dropId={drop.id}
          initialLiked={viewerDropLiked ?? false}
          initialCount={drop.dropLikeCount}
        />
      </div>

      {/* Moved below Share/Save/Like, and the average/count now sits
          inline next to the stars instead of as its own stacked line
          above them (2026-10-15 round 2 — founder's own ask: keep
          showing the number, just not duplicated right on top of the
          interactive control). RateDropControl itself is the viewer's
          own "rate this drop" action — distinct from each track's own
          per-song rating in the tracklist below; the inline number is
          just the drop's overall average, shown whenever anyone's
          rated it. */}
      <div className="rate-row">
        <RateDropControl dropId={drop.id} initialRating={viewerRating ?? null} />
        {drop.rating.count > 0 && (
          <span className="mut rate-summary">
            {drop.rating.average?.toFixed(1)} · {drop.rating.count}{" "}
            {drop.rating.count === 1 ? "rating" : "ratings"}
          </span>
        )}
      </div>

      <Tracklist songs={curatorSongs} likedSet={likedSet} songRatings={songRatings} />

      {drop.notes.length > 0 && (
        <>
          <div className="label" style={{ marginTop: 30, marginBottom: 12 }}>
            Curator notes
          </div>
          <div className="curator-notes" style={{ marginTop: 0 }}>
            {drop.notes.map((note, i) => (
              <div className="curator-note" key={i}>
                <div className="curator-name">
                  <RoleName name={note.curatorName} isCurator />
                </div>
                <div className="note-text">{note.text}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {drop.top10 && (
        <>
          <div className="label" style={{ marginTop: 30, marginBottom: 12 }}>
            Subscriber Top 10
            <InfoTip text="The songs you all voted for between drops." />
          </div>
          <div className="roster-list" style={{ marginBottom: drop.top10.spotifyUrl || drop.top10.appleUrl ? 16 : 0 }}>
            {drop.top10.tally.map((row, i) => (
              <div className="roster-row" key={i}>
                <span className="roster-name">
                  {i + 1}. {row.title && row.artist ? `${row.title} — ${row.artist}` : "a track"}
                </span>
                {row.votes !== null && (
                  <span className="roster-meta">
                    {row.votes} vote{row.votes === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            ))}
          </div>
          {(drop.top10.spotifyUrl || drop.top10.appleUrl) && (
            <div className="listen-row">
              {drop.top10.spotifyUrl && (
                <a className="btn btn-outline" href={drop.top10.spotifyUrl} target="_blank" rel="noreferrer">
                  Spotify ↗
                </a>
              )}
              {drop.top10.appleUrl && (
                <a className="btn btn-outline" href={drop.top10.appleUrl} target="_blank" rel="noreferrer">
                  Apple Music ↗
                </a>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Tracklist({
  songs,
  likedSet,
  songRatings,
}: {
  songs: PublicSongRow[];
  likedSet: Set<number>;
  songRatings: Record<number, number>;
}) {
  return (
    <>
      {/* Used to also have a right-aligned "Picked by" label here, but
          that column never actually rendered curator credit — it's the
          like button + star rating (see track-row-controls below). The
          real curator credit already shows inline per-track
          (.track-credit); fixing the mislabel rather than relabeling it
          to match, since the icons read fine without a header
          (2026-10-09 design-pass round — see claude/next-build.md). */}
      <div className="tracklist-header">
        <span className="label">The songs</span>
      </div>
      <hr className="hairline" style={{ margin: "0 0 4px" }} />
      {/* Player revamp (2026-10-08 — see claude/next-build.md): this
          tracklist is its own queue — clicking any track plays through
          the whole list, in this order, with shuffle/back/next/loop
          all operating on just these Curator Picks (Listener Picks
          live on their own separate page/queue — see
          /drop/[num]/listener-picks). */}
      <PlayQueue
        songs={songs.map((s) => ({
          songId: s.id,
          spotifyUri: s.spotifyUri,
          artworkUrl: s.artworkUrl,
          title: s.title,
          artist: s.artist,
        }))}
      >
        <div>
          {songs.map((song, i) => (
            <div className="track-row" key={song.id}>
              {/* Numbered rows + per-song artwork swatch (2026-10
                  release-page redesign — a playlist-like feel, see
                  claude/next-build.md) — falls back to a plain gradient
                  swatch when a song has no artwork, same spirit as
                  DropTile's own empty-quadrant fallback.
                  Playback round (2026-10-08 — see claude/next-build.md):
                  the artwork is the play target now (PlayableArt), not a
                  link — "clicking the artwork... plays from spotify."
                  Navigating to the artist moved onto the title/artist
                  TEXT instead ("clicking the text... takes it to the
                  artist page"). */}
              <div className="track-row-top">
                <div className="track-row-num">{String(i + 1).padStart(2, "0")}</div>
                <PlayableArt
                  spotifyUri={song.spotifyUri}
                  artworkUrl={song.artworkUrl}
                  title={song.title}
                  artist={song.artist}
                  songId={song.id}
                  className="track-row-art"
                  fallbackClassName="track-row-art track-row-art-empty"
                />
              <div className="track-row-body">
                <div className="track-info">
                  <Link href={artistHref(song.artist)} className="track-title">
                    {song.title}
                  </Link>
                  <Link href={artistHref(song.artist)} className="track-artist">
                    {song.artist}
                  </Link>
                </div>
                <div className="track-credit">
                  {song.curatorCredit && <RoleName name={song.curatorCredit} isCurator />}
                </div>
              </div>
              {/* Like + star rating, stacked and the same size, right
                  next to the title/artist (2026-10-07 — see
                  claude/next-build.md). */}
              <div className="track-row-controls">
                <LikeButton songId={song.id} initialLiked={likedSet.has(song.id)} initialCount={song.likeCount} />
                <SongRatingControl songId={song.id} initialRating={songRatings[song.id] ?? null} />
              </div>
            </div>
          </div>
        ))}
        </div>
      </PlayQueue>
    </>
  );
}
