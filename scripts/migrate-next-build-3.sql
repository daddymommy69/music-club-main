-- ============================================================================
-- PRODUCTION CATCH-UP: round 3 of the "next build" slice — the Browse
-- round (see claude/next-build.md): per-song ratings and the artist ->
-- Spotify photo cache.
--
-- Run this whole script, top to bottom, in Supabase's SQL Editor, same
-- as scripts/migrate-next-build.sql and migrate-next-build-2.sql before
-- it. This brings production's schema up to date with src/db/schema.ts
-- for everything this round added:
--
--   PART A — the new song_ratings table (one 1-5 rating per member per
--            song, upsertable — same shape as drop_ratings).
--   PART B — the new artist_spotify_cache table (best-effort cache of
--            "this free-text artist name -> this real Spotify artist,"
--            global/not club-scoped — see that table's own comment in
--            schema.ts for why).
--   PART C — automatic verification, then COMMIT.
--
-- RUN THIS AS ONE SINGLE PASTE, ONE SINGLE CLICK OF "RUN." Do not split
-- it into multiple separate executions — see migrate-next-build.sql's
-- own header for why a split verify/COMMIT is unsafe in Supabase's SQL
-- Editor. This script follows that same single-paste, self-verifying,
-- self-committing shape.
--
-- Every step below is written to be safe to re-run from scratch if it
-- ever only partially applied (IF NOT EXISTS everywhere).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- PART A — song_ratings (one 1-5 rating per member per song, upsertable).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS song_ratings (
  id serial PRIMARY KEY,
  song_id integer NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  member_id integer NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  rating integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (song_id, member_id)
);

-- ----------------------------------------------------------------------------
-- PART B — artist_spotify_cache (best-effort name -> Spotify artist cache).
-- Deliberately has no club_id — see this table's comment in schema.ts.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS artist_spotify_cache (
  id serial PRIMARY KEY,
  normalized_name text NOT NULL UNIQUE,
  spotify_artist_id text,
  photo_url text,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- PART C — automatic verification. Raises (and rolls back everything
-- above) if anything looks wrong, rather than relying on a human
-- eyeballing a result between separate SQL Editor runs. This file only
-- ever ends in two states: fully committed and correct, or fully rolled
-- back with a clear error.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  song_ratings_exists boolean := EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'song_ratings'
  );
  artist_cache_exists boolean := EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'artist_spotify_cache'
  );
BEGIN
  IF NOT song_ratings_exists THEN
    RAISE EXCEPTION 'song_ratings table did not get created. Nothing committed.';
  END IF;
  IF NOT artist_cache_exists THEN
    RAISE EXCEPTION 'artist_spotify_cache table did not get created. Nothing committed.';
  END IF;

  RAISE NOTICE 'All checks passed: song_ratings and artist_spotify_cache both present. Committing.';
END $$;

COMMIT;

-- Safe to run after the above — just a read, already committed either way.
SELECT
  (SELECT count(*) FROM song_ratings) AS song_ratings_table_exists,
  (SELECT count(*) FROM artist_spotify_cache) AS artist_spotify_cache_table_exists;
