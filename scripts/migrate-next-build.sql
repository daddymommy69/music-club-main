-- ============================================================================
-- PRODUCTION CATCH-UP: the "next build" slice — Listener Picks, song
-- likes UI's backing columns, drop ratings, favorite-drops showcase,
-- member bios.
--
-- Run this whole script, top to bottom, in Supabase's SQL Editor, same
-- as scripts/migrate-to-members.sql before it. This brings production's
-- schema up to date with src/db/schema.ts for everything this build
-- added:
--
--   PART A — members.bio (new nullable column).
--   PART B — the pick_type enum + songs.pick_type / songs.submitted_by_
--            member_id (the Curator Pick / Listener Pick split) and its
--            partial unique index (one Listener Pick per member per
--            drop).
--   PART C — the new drop_ratings table.
--   PART D — the new member_favorites table.
--   PART E — automatic verification, then COMMIT.
--
-- RUN THIS AS ONE SINGLE PASTE, ONE SINGLE CLICK OF "RUN." Do not split
-- it into multiple separate executions. Splitting verification from
-- COMMIT across two separate SQL Editor runs is exactly the mistake
-- that caused a real production incident earlier in this project (see
-- migrate-to-members.sql's own header) — Supabase's SQL Editor doesn't
-- guarantee it keeps one open connection/transaction across two separate
-- "Run" clicks, so a script that isn't one single BEGIN...COMMIT paste
-- can silently roll back instead of committing. This script follows
-- that same single-paste, self-verifying, self-committing shape.
--
-- Every step below is written to be safe to re-run from scratch if it
-- ever only partially applied (IF NOT EXISTS everywhere, and the enum
-- type is created via a DO block since Postgres has no
-- `CREATE TYPE IF NOT EXISTS`).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- PART A — members.bio
-- ----------------------------------------------------------------------------
ALTER TABLE members ADD COLUMN IF NOT EXISTS bio text;

-- ----------------------------------------------------------------------------
-- PART B — Curator Picks vs. Listener Picks.
-- ----------------------------------------------------------------------------

-- Postgres has no `CREATE TYPE IF NOT EXISTS` — check pg_type by hand.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pick_type') THEN
    CREATE TYPE pick_type AS ENUM ('curator', 'listener');
  END IF;
END $$;

ALTER TABLE songs ADD COLUMN IF NOT EXISTS pick_type pick_type NOT NULL DEFAULT 'curator';
ALTER TABLE songs ADD COLUMN IF NOT EXISTS submitted_by_member_id integer;

-- FK on the new column, added only if it isn't already there (a bare
-- ADD COLUMN above never adds one) — checked by constraint name rather
-- than IF NOT EXISTS, which ALTER TABLE ... ADD CONSTRAINT doesn't
-- support. Name matches drizzle-kit's own naming convention so a later
-- `drizzle-kit push` sees this as already in sync.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'songs_submitted_by_member_id_members_id_fk'
  ) THEN
    ALTER TABLE songs
      ADD CONSTRAINT songs_submitted_by_member_id_members_id_fk
      FOREIGN KEY (submitted_by_member_id) REFERENCES members(id) ON DELETE SET NULL;
  END IF;
END $$;

-- "One Listener Pick per member per drop" — a partial unique index
-- (only applies to pick_type = 'listener' rows), matching the Drizzle
-- schema's uniqueIndex(...).where(sql`pick_type = 'listener'`) exactly.
-- A curator's own curatorId-owned Curator Picks are untouched by this —
-- they're separate rows this index never looks at.
CREATE UNIQUE INDEX IF NOT EXISTS songs_one_listener_pick_per_drop
  ON songs (drop_id, submitted_by_member_id)
  WHERE (pick_type = 'listener');

-- ----------------------------------------------------------------------------
-- PART C — drop_ratings (one 1-5 rating per member per drop, upsertable).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS drop_ratings (
  id serial PRIMARY KEY,
  drop_id integer NOT NULL REFERENCES drops(id) ON DELETE CASCADE,
  member_id integer NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  rating integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (drop_id, member_id)
);

-- ----------------------------------------------------------------------------
-- PART D — member_favorites (up to 5 showcased drops per member, ordered).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS member_favorites (
  id serial PRIMARY KEY,
  member_id integer NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  drop_id integer NOT NULL REFERENCES drops(id) ON DELETE CASCADE,
  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, position),
  UNIQUE (member_id, drop_id)
);

-- ----------------------------------------------------------------------------
-- PART E — automatic verification. Raises (and rolls back everything
-- above) if anything looks wrong, rather than relying on a human
-- eyeballing a result between separate SQL Editor runs — see
-- migrate-to-members.sql's own Part F for why that two-step pattern
-- isn't safe here. This file only ever ends in two states: fully
-- committed and correct, or fully rolled back with a clear error.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  bio_col_exists boolean := EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'bio'
  );
  pick_type_exists boolean := EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pick_type');
  pick_type_col_exists boolean := EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'songs' AND column_name = 'pick_type'
  );
  submitter_col_exists boolean := EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'songs' AND column_name = 'submitted_by_member_id'
  );
  listener_index_exists boolean := EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'songs_one_listener_pick_per_drop'
  );
  drop_ratings_exists boolean := EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'drop_ratings'
  );
  member_favorites_exists boolean := EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'member_favorites'
  );
  songs_missing_pick_type int := (SELECT count(*) FROM songs WHERE pick_type IS NULL);
  dangling_submitters int := (
    SELECT count(*) FROM songs
    WHERE submitted_by_member_id IS NOT NULL
      AND submitted_by_member_id NOT IN (SELECT id FROM members)
  );
BEGIN
  IF NOT bio_col_exists THEN
    RAISE EXCEPTION 'members.bio did not get created. Nothing committed.';
  END IF;
  IF NOT pick_type_exists OR NOT pick_type_col_exists OR NOT submitter_col_exists THEN
    RAISE EXCEPTION 'Curator/Listener Pick columns are incomplete (pick_type enum: %, songs.pick_type: %, songs.submitted_by_member_id: %). Nothing committed.',
      pick_type_exists, pick_type_col_exists, submitter_col_exists;
  END IF;
  IF NOT listener_index_exists THEN
    RAISE EXCEPTION 'songs_one_listener_pick_per_drop index did not get created. Nothing committed.';
  END IF;
  IF NOT drop_ratings_exists THEN
    RAISE EXCEPTION 'drop_ratings table did not get created. Nothing committed.';
  END IF;
  IF NOT member_favorites_exists THEN
    RAISE EXCEPTION 'member_favorites table did not get created. Nothing committed.';
  END IF;
  IF songs_missing_pick_type > 0 THEN
    RAISE EXCEPTION '% existing song row(s) ended up with a null pick_type — the NOT NULL DEFAULT should have backfilled every row. Nothing committed.',
      songs_missing_pick_type;
  END IF;
  IF dangling_submitters > 0 THEN
    RAISE EXCEPTION '% song row(s) have a submitted_by_member_id pointing at no real member. Nothing committed.',
      dangling_submitters;
  END IF;

  RAISE NOTICE 'All checks passed: members.bio, pick_type enum + songs columns + partial unique index, drop_ratings, member_favorites all present and consistent. Committing.';
END $$;

COMMIT;

-- Safe to run after the above — just a read, already committed either way.
SELECT
  (SELECT count(*) FROM songs WHERE pick_type = 'listener') AS listener_picks,
  (SELECT count(*) FROM songs WHERE pick_type = 'curator') AS curator_picks,
  (SELECT count(*) FROM drop_ratings) AS drop_ratings_table_exists,
  (SELECT count(*) FROM member_favorites) AS member_favorites_table_exists;
