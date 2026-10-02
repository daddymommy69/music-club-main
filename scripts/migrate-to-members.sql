-- ============================================================================
-- Unified account model: migrate curators + subscribers into one
-- `members` table (see claude/next-build.md and src/db/schema.ts).
--
-- WHO SHOULD RUN THIS: the founder, by hand, in Supabase's SQL Editor,
-- AFTER the application-code changes that introduce `members` /
-- `login_codes` / `song_likes` have been deployed (drizzle-kit push, or
-- the equivalent manual DDL, must have already created those tables —
-- this script only moves data into them, it does not create tables).
--
-- WHAT THIS DOES:
--   1. Matches each curator to the subscriber row that's really the
--      same person (by phone or email), so a person who was both
--      doesn't end up as two member rows.
--   2. Copies every subscriber into `members` (is_curator = false
--      unless step 1 found a match), carrying over `you_token` AS-IS
--      into the new `member_token` column — this is NOT optional:
--      every /you/<token> link already texted or emailed to a real
--      subscriber keeps working this way. A fresh/null token would
--      silently break every link anyone has already received.
--   3. Copies every curator who had NO matching subscriber into
--      `members` as a new row (is_curator = true, no token — curators
--      never had a /you link before, so there's nothing to preserve;
--      the app backfills one automatically the first time a release
--      goes out to them, same self-healing pattern already used for
--      subscribers created before /you existed).
--   4. Flags jacobfogelhut@gmail.com's member row is_admin = true.
--   5. Remaps every foreign key that pointed at the old `curators` /
--      `subscribers` tables (songs.curator_id, curator_notes.curator_id,
--      comments.curator_id, top10_entries.subscriber_id) to point at
--      the new `members` row for the same person.
--
-- WHAT THIS DELIBERATELY DOES NOT DO:
--   - Drop the old `curators` / `subscribers` / `curator_login_codes`
--     tables. That's a separate, commented-out block at the very
--     bottom — run it by hand, later, only after you've looked at the
--     verification counts below and everything checks out. Keeping the
--     old tables around for a few days costs nothing and means this is
--     recoverable if something looks wrong.
--   - Migrate `curator_login_codes` rows. Those are one-time six-digit
--     login codes — by the time you're running this they're either
--     already consumed or already expired, so there's nothing in that
--     table worth keeping.
--
-- SAFETY: wrapped in one transaction. If anything below raises, nothing
-- is committed. The script also refuses to run if `members` already
-- has rows, so it can't accidentally double-migrate.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM members) THEN
    RAISE EXCEPTION 'members already has rows — this looks like it already ran. Stopping before touching anything.';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Step 1: which curators are really the same person as a subscriber?
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE _curator_subscriber_match AS
SELECT c.id AS curator_id, s.id AS subscriber_id
FROM curators c
JOIN subscribers s
  ON s.club_id = c.club_id
 AND (
   (c.phone_key IS NOT NULL AND c.phone_key = s.phone_key)
   OR (c.email_key IS NOT NULL AND c.email_key = s.email_key)
 );

-- A curator should never match more than one subscriber row. If this
-- fires, someone's phone matches one subscriber and their email matches
-- a *different* subscriber — a real data inconsistency that needs a
-- human to look at the three rows involved before this can proceed.
DO $$
DECLARE dupe_count int;
BEGIN
  SELECT count(*) INTO dupe_count FROM (
    SELECT curator_id FROM _curator_subscriber_match GROUP BY curator_id HAVING count(*) > 1
  ) t;
  IF dupe_count > 0 THEN
    RAISE EXCEPTION '% curator(s) matched more than one subscriber row by phone/email — resolve by hand before re-running.', dupe_count;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Step 2: every subscriber becomes a member.
-- ----------------------------------------------------------------------------
INSERT INTO members (
  club_id, name, phone, email, phone_key, email_key,
  is_curator, is_admin, wants_text, wants_email, sms_consent, sms_opt_in_at,
  opted_out, member_token, created_at
)
SELECT
  s.club_id,
  s.name,
  s.phone,
  s.email,
  s.phone_key,
  s.email_key,
  EXISTS (SELECT 1 FROM _curator_subscriber_match m WHERE m.subscriber_id = s.id), -- is_curator
  false,                                                                           -- is_admin (fixed up in step 4)
  s.wants_text,
  s.wants_email,
  s.sms_consent,
  s.sms_opt_in_at,
  s.opted_out,
  s.you_token,                                                                     -- carried over as-is, see header
  s.created_at
FROM subscribers s;

-- Map old subscriber id -> new member id. Safe to back-match this way
-- (rather than needing RETURNING to carry the source id through) because
-- (club_id, phone_key) and (club_id, email_key) are unique on both the
-- old and new tables, so this join can't pair a subscriber with the
-- wrong member.
CREATE TEMP TABLE _subscriber_to_member (subscriber_id int PRIMARY KEY, member_id int NOT NULL);
INSERT INTO _subscriber_to_member (subscriber_id, member_id)
SELECT s.id, m.id
FROM subscribers s
JOIN members m
  ON m.club_id = s.club_id
 AND (
   (s.phone_key IS NOT NULL AND m.phone_key = s.phone_key)
   OR (s.email_key IS NOT NULL AND m.email_key = s.email_key)
 );

-- ----------------------------------------------------------------------------
-- Step 3: curators with no matching subscriber become new member rows.
-- ----------------------------------------------------------------------------
INSERT INTO members (
  club_id, name, phone, email, phone_key, email_key,
  is_curator, is_admin, wants_text, wants_email, sms_consent, sms_opt_in_at,
  opted_out, member_token, created_at
)
SELECT
  c.club_id,
  c.name,
  c.phone,
  c.email,
  c.phone_key,
  c.email_key,
  true,   -- is_curator
  false,  -- is_admin (fixed up in step 4)
  false,  -- wants_text — curators never had this column; default to "not opted in," same as before
  false,  -- wants_email — same
  false,  -- sms_consent
  NULL,   -- sms_opt_in_at
  false,  -- opted_out
  NULL,   -- member_token — no prior /you link to preserve; self-heals on first send
  c.joined_at
FROM curators c
WHERE NOT EXISTS (SELECT 1 FROM _curator_subscriber_match m WHERE m.curator_id = c.id);

-- Map old curator id -> new member id, covering BOTH cases: curators
-- merged into a subscriber's row in step 2, and curator-only rows just
-- inserted in step 3.
CREATE TEMP TABLE _curator_to_member (curator_id int PRIMARY KEY, member_id int NOT NULL);

INSERT INTO _curator_to_member (curator_id, member_id)
SELECT m.curator_id, stm.member_id
FROM _curator_subscriber_match m
JOIN _subscriber_to_member stm ON stm.subscriber_id = m.subscriber_id;

INSERT INTO _curator_to_member (curator_id, member_id)
SELECT c.id, mem.id
FROM curators c
JOIN members mem
  ON mem.club_id = c.club_id
 AND (
   (c.phone_key IS NOT NULL AND mem.phone_key = c.phone_key)
   OR (c.email_key IS NOT NULL AND mem.email_key = c.email_key)
 )
WHERE NOT EXISTS (SELECT 1 FROM _curator_to_member ctm WHERE ctm.curator_id = c.id);

-- Every curator should now be mapped exactly once. If this fires, step
-- 3's insert and this back-match disagreed about who's curator-only —
-- stop rather than remap foreign keys against incomplete data.
DO $$
DECLARE missing_count int;
BEGIN
  SELECT count(*) INTO missing_count
  FROM curators c
  WHERE NOT EXISTS (SELECT 1 FROM _curator_to_member ctm WHERE ctm.curator_id = c.id);
  IF missing_count > 0 THEN
    RAISE EXCEPTION '% curator(s) never got mapped to a member row — stopping before touching foreign keys.', missing_count;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Step 4: the founder is the one admin, for now (claude/next-build.md).
-- A plain UPDATE rather than baking it into the inserts above so there's
-- exactly one place this email address appears.
-- ----------------------------------------------------------------------------
UPDATE members SET is_admin = true WHERE email_key = 'jacobfogelhut@gmail.com';

-- ----------------------------------------------------------------------------
-- Step 5: remap foreign keys that pointed at the old tables.
-- ----------------------------------------------------------------------------
UPDATE songs s
SET curator_id = ctm.member_id
FROM _curator_to_member ctm
WHERE s.curator_id = ctm.curator_id;

UPDATE curator_notes cn
SET curator_id = ctm.member_id
FROM _curator_to_member ctm
WHERE cn.curator_id = ctm.curator_id;

UPDATE comments cm
SET curator_id = ctm.member_id
FROM _curator_to_member ctm
WHERE cm.curator_id = ctm.curator_id;

UPDATE top10_entries t
SET subscriber_id = stm.member_id
FROM _subscriber_to_member stm
WHERE t.subscriber_id = stm.subscriber_id;

-- ----------------------------------------------------------------------------
-- Verification — eyeball these before COMMIT. Row counts should line up:
--   members total            = subscribers + curators - (matched pairs)
--   members where is_curator = curators (count)
--   any FK remap gaps        = 0 rows
-- ----------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM subscribers)                         AS old_subscribers,
  (SELECT count(*) FROM curators)                            AS old_curators,
  (SELECT count(*) FROM _curator_subscriber_match)           AS merged_pairs,
  (SELECT count(*) FROM members)                             AS new_members,
  (SELECT count(*) FROM members WHERE is_curator)             AS new_members_is_curator,
  (SELECT count(*) FROM members WHERE is_admin)               AS new_members_is_admin,
  (SELECT count(*) FROM songs WHERE curator_id IS NOT NULL
     AND curator_id NOT IN (SELECT id FROM members))          AS songs_dangling_fk,
  (SELECT count(*) FROM curator_notes
     WHERE curator_id NOT IN (SELECT id FROM members))        AS curator_notes_dangling_fk,
  (SELECT count(*) FROM comments
     WHERE curator_id NOT IN (SELECT id FROM members))        AS comments_dangling_fk,
  (SELECT count(*) FROM top10_entries
     WHERE subscriber_id NOT IN (SELECT id FROM members))     AS top10_dangling_fk;

-- If every *_dangling_fk column above is 0, new_members = old_subscribers
-- + old_curators - merged_pairs, and new_members_is_curator =
-- old_curators, this is good to commit:
--
--   COMMIT;
--
-- If anything looks off, don't commit — just close the SQL editor tab
-- (or run ROLLBACK;) and nothing above happened.


-- ============================================================================
-- OPTIONAL CLEANUP — run this as its own separate statement, by hand,
-- only after the migration above has been committed AND you've confirmed
-- the app works correctly against the new `members` table in production
-- for a few days. Not part of the transaction above on purpose: there's
-- no rush to drop the old tables, and keeping them around costs nothing.
-- ============================================================================
-- BEGIN;
-- DROP TABLE curator_login_codes;
-- DROP TABLE curators;
-- DROP TABLE subscribers;
-- COMMIT;
