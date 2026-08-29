import type { PublicDropDetail } from "@/lib/archive";
import { formatDropMonth } from "@/lib/format";
import CloseButton from "./CloseButton";

export default function DropDetail({
  drop,
  closable,
  shareUrl,
}: {
  drop: PublicDropDetail;
  closable?: boolean;
  shareUrl: string;
}) {
  return (
    <div className="drop-detail">
      <div className="top-row">
        <div className="numeral" style={{ fontSize: 40 }}>
          {String(drop.num).padStart(2, "0")}
        </div>
        {closable && <CloseButton />}
      </div>
      <div className="drop-title">{drop.title ?? `Drop ${drop.num}`}</div>
      <div className="mut" style={{ fontSize: 11 }}>
        {formatDropMonth(drop.publishedAt)} · {drop.songs.length}{" "}
        {drop.songs.length === 1 ? "song" : "songs"}
      </div>
      <div className="share-url">{shareUrl}</div>

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

      <div className="tracklist-header">
        <span className="label">The songs</span>
        <span className="label">Picked by</span>
      </div>
      <hr className="hairline" style={{ margin: "0 0 4px" }} />
      <div>
        {drop.songs.map((song, i) => (
          <div className="track-row" key={i}>
            <div className="track-info">
              <div className="track-title">{song.title}</div>
              <div className="track-artist">{song.artist}</div>
            </div>
            <div className="track-credit">{song.curatorCredit ?? ""}</div>
          </div>
        ))}
      </div>

      {drop.notes.length > 0 && (
        <>
          <div className="label" style={{ marginTop: 30, marginBottom: 12 }}>
            Curator notes
          </div>
          <div className="curator-notes" style={{ marginTop: 0 }}>
            {drop.notes.map((note, i) => (
              <div className="curator-note" key={i}>
                <div className="curator-name">{note.curatorName}</div>
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
