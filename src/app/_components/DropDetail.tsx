import type { PublicDropDetail, PublicSongRow } from "@/lib/archive";
import { formatDropMonth } from "@/lib/format";
import CloseButton from "./CloseButton";
import DropTile from "./DropTile";
import SongEmbed from "./SongEmbed";
import LikeButton from "./LikeButton";
import DropLikeButton from "./DropLikeButton";
import DropSaveButton from "./DropSaveButton";
import RateDropControl from "./RateDropControl";
import RoleName from "./RoleName";

export default function DropDetail({
  drop,
  closable,
  shareUrl,
  likedSongIds,
  viewerRating,
  viewerDropLiked,
  viewerDropSaved,
}: {
  drop: PublicDropDetail;
  closable?: boolean;
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
}) {
  const artworkUrls = drop.songs
    .map((s) => s.artworkUrl)
    .filter((url): url is string => !!url)
    .slice(0, 4);

  const likedSet = new Set(likedSongIds ?? []);

  // Listener Picks no longer show on this page at all (2026-10
  // release-page redesign — see claude/next-build.md): they moved to
  // their own dedicated /drop/[num]/listener-picks page, reached from
  // the /releases archive card. This tracklist is always just the
  // Curator Picks now, same single unheaded list every drop had before
  // Listener Picks existed — drop.songs itself is unchanged (still
  // every song, both pick types) since other callers of getPublicDrop
  // (e.g. the listener-picks page) need the full set.
  const curatorSongs = drop.songs.filter((s) => s.pickType === "curator");

  return (
    <div className="drop-detail">
      <div className="top-row">
        <DropTile num={drop.num} artworkUrls={artworkUrls} hero />
        {closable && <CloseButton />}
      </div>
      <div className="drop-title">{drop.title ?? `Drop ${drop.num}`}</div>
      <div className="mut" style={{ fontSize: 11 }}>
        {formatDropMonth(drop.publishedAt)} · {curatorSongs.length}{" "}
        {curatorSongs.length === 1 ? "song" : "songs"}
      </div>
      <div className="share-url">{shareUrl}</div>

      {drop.rating.count > 0 && (
        <div className="drop-rating-line">
          ★ {drop.rating.average?.toFixed(1)} · {drop.rating.count}{" "}
          {drop.rating.count === 1 ? "rating" : "ratings"}
        </div>
      )}
      <RateDropControl dropId={drop.id} initialRating={viewerRating ?? null} />

      {/* Whole-drop Save/Like controls (2026-10 release-page redesign —
          see claude/next-build.md) — distinct from the Spotify/Apple
          Music "open the real playlist" links right below. */}
      <div className="drop-controls-row">
        <DropSaveButton dropId={drop.id} initialSaved={viewerDropSaved ?? false} />
        <DropLikeButton
          dropId={drop.id}
          initialLiked={viewerDropLiked ?? false}
          initialCount={drop.dropLikeCount}
        />
      </div>

      <div className="listen-row">
        {drop.spotifyUrl && (
          <a
            className="btn btn-outline"
            href={drop.spotifyUrl}
            target="_blank"
            rel="noreferrer"
          >
            Spotify ↗
          </a>
        )}
        {drop.appleUrl && (
          <a
            className="btn btn-outline"
            href={drop.appleUrl}
            target="_blank"
            rel="noreferrer"
          >
            Apple Music ↗
          </a>
        )}
      </div>

      <Tracklist songs={curatorSongs} likedSet={likedSet} />

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
          </div>
          <p className="mut" style={{ fontSize: 11, marginBottom: 14 }}>
            The songs you all voted for between drops.
          </p>
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

function Tracklist({ songs, likedSet }: { songs: PublicSongRow[]; likedSet: Set<number> }) {
  return (
    <>
      <div className="tracklist-header">
        <span className="label">The songs</span>
        <span className="label">Picked by</span>
      </div>
      <hr className="hairline" style={{ margin: "0 0 4px" }} />
      <div>
        {songs.map((song, i) => (
          <div className="track-row" key={song.id}>
            {/* Numbered rows + per-song artwork swatch (2026-10
                release-page redesign — a playlist-like feel, see
                claude/next-build.md) — falls back to a plain gradient
                swatch when a song has no artwork, same spirit as
                DropTile's own empty-quadrant fallback. */}
            <div className="track-row-top">
              <div className="track-row-num">{String(i + 1).padStart(2, "0")}</div>
              {song.artworkUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={song.artworkUrl} alt="" className="track-row-art" />
              ) : (
                <div className="track-row-art track-row-art-empty" aria-hidden="true" />
              )}
              <div className="track-row-body">
                <div className="track-info">
                  <div className="track-title">{song.title}</div>
                  <div className="track-artist">{song.artist}</div>
                </div>
                <div className="track-credit">
                  {song.curatorCredit && <RoleName name={song.curatorCredit} isCurator />}
                </div>
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <LikeButton songId={song.id} initialLiked={likedSet.has(song.id)} initialCount={song.likeCount} />
            </div>
            <SongEmbed sourceUrl={song.sourceUrl} />
          </div>
        ))}
      </div>
    </>
  );
}
