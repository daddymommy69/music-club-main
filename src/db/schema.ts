import {
  pgTable,
  pgEnum,
  serial,
  text,
  varchar,
  boolean,
  timestamp,
  integer,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Club-scoped schema, per the design handoff (claude/design-handoff.md
 * in the project docs). Every table carries club_id (directly, or via
 * drop_id which itself belongs to a club) even though only one club
 * launches — this is an explicit, non-negotiable requirement so the
 * multi-club screens (#/clubs, #/new — intentionally unbuilt for
 * launch) can be added later without a schema rewrite.
 *
 * Two things the README describes but this schema deliberately does
 * NOT store, because they're reproducible: it says its data model
 * "describes what to reproduce, not how to structure the
 * implementation."
 *   - Club.current_drop_num / next_drop_num / subscriber_count /
 *     submission_count / days_until_next — all computed via queries.
 *   - Curator.picks_this_cycle / picks_total — computed via queries.
 *
 * Anonymity rule (enforced at the query layer, not just here):
 * Song.submittedBy must NEVER appear in a public payload. Only
 * Song.curatorCredit is public.
 */

export const cycleEnum = pgEnum("cycle", [
  "weekly",
  "biweekly", // "every two weeks"
  "monthly",
  "every45", // "every 45 days"
  "quarterly",
  "custom",
  "manual", // no scheduled date — UI degrades to "coming when it's ready"
]);

export const clubs = pgTable("clubs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  joinCode: varchar("join_code", { length: 32 }).notNull().unique(), // e.g. "GOOBERZ-4821"
  cycle: cycleEnum("cycle").notNull().default("every45"),
  // only meaningful when cycle = 'custom'
  cycleCustomDays: integer("cycle_custom_days"),
  // Spotify auto-build (2026-10 decision): a long-lived refresh token for
  // whichever single Spotify account did the one-time /api/spotify/connect
  // authorization — that account is the one that owns every auto-built
  // playlist. Dynamic data (not a static secret like the env vars), so it
  // lives here rather than in an env var. Null means "never connected, or
  // connection needs to be redone" — every call site treats that as a
  // signal to fall back to the manual paste-the-link flow rather than
  // erroring, same as a revoked/expired token (see src/lib/spotify.ts).
  spotifyRefreshToken: text("spotify_refresh_token"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const drops = pgTable(
  "drops",
  {
    id: serial("id").primaryKey(),
    clubId: integer("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    num: integer("num").notNull(),
    title: text("title"),
    // null while the drop is still being privately built by curators.
    // Setting this is what "shipping" a drop means.
    publishedAt: timestamp("published_at", { withTimezone: true }),
    spotifyUrl: text("spotify_url"),
    appleUrl: text("apple_url"),
    // Set once a curator pastes in the Subscriber Top 10 playlist, after
    // the Top 10 window closes with 10+ unique songs — same manual
    // paste-the-link pattern as spotifyUrl/appleUrl above, just for the
    // separate subscriber-voted playlist rather than the curated one.
    // Null below the 10-song threshold; there's no playlist to build.
    top10SpotifyUrl: text("top10_spotify_url"),
    top10AppleUrl: text("top10_apple_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.clubId, table.num)],
);

/**
 * Curator Picks vs. Listener Picks (2026-10 decision — see
 * claude/next-build.md). Every song still belongs to exactly one drop
 * and renders in one tracklist, but who put it there now matters for
 * public attribution: a Curator Pick is credited via curatorCredit
 * (unchanged), a Listener Pick is credited via the real member behind
 * submittedByMemberId below — a deliberate policy change, since
 * submittedBy itself stays private forever (see that column's comment).
 */
export const pickTypeEnum = pgEnum("pick_type", ["curator", "listener"]);

export const songs = pgTable(
  "songs",
  {
    id: serial("id").primaryKey(),
    dropId: integer("drop_id")
      .notNull()
      .references(() => drops.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    artist: text("artist").notNull(),
    // Resolved from the submitted Spotify/Apple link via Odesli, kept
    // around for re-resolving / dedupe.
    sourceUrl: text("source_url"),
    artworkUrl: text("artwork_url"),
    // Set by the Spotify auto-build step (src/lib/spotifyBuild.ts) when
    // shipping finds a confident match for this song on Spotify — null
    // either because auto-build hasn't run yet or because no match was
    // found, and the two cases are deliberately not distinguished here:
    // ship's response already tells the curator which titles came up
    // empty at the moment it happens, and this column only needs to
    // answer "is this song actually in the built playlist."
    spotifyUri: text("spotify_uri"),
    // Who sent it in, as free text. PRIVATE — never returned from a
    // public query. Legacy: every pre-Listener-Pick submission (the old
    // /submit anonymous-name flow, SMS text-in, room quick-add) wrote
    // here; new rows keep writing it too where it still applies, but
    // the real, public-attributable submitter of a Listener Pick is
    // submittedByMemberId below, not this column.
    submittedBy: text("submitted_by"),
    // The curator who championed the track. PUBLIC. Null/empty means
    // a subscriber submission nobody claimed credit for.
    curatorCredit: text("curator_credit"),
    // Same curator as curatorCredit, but a real FK — used for the room's
    // per-curator columns (curatorCredit is just display text and isn't
    // reliable to group/own by). Nullable: a subscriber submission pulled
    // into the drop with no curator attached yet has no owner. Points at
    // `members` (unified account model) — still named/scoped to "curator"
    // since that's what this column means, just not its own table anymore.
    curatorId: integer("curator_id").references(() => members.id, { onDelete: "set null" }),
    // 'curator' (default, every pre-existing row) or 'listener'. Drives
    // which public section (Curator Picks / Listener Picks) a song shows
    // under on the release page — see DropDetail.tsx.
    pickType: pickTypeEnum("pick_type").notNull().default("curator"),
    // The real, public-attributable member behind a Listener Pick — set
    // only when pickType = 'listener'. A curator can ALSO have their own
    // personal Listener Pick on the same drop (a different row from any
    // Curator Pick they own via curatorId) — the founder was explicit
    // these are different roles/rows, never merged into one.
    submittedByMemberId: integer("submitted_by_member_id").references(() => members.id, {
      onDelete: "set null",
    }),
    // Display order within the drop's tracklist.
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // "One Listener Pick per member per drop" — a real partial unique
    // index (only applies to pickType = 'listener' rows) rather than a
    // table-wide constraint, since a curator's own curatorId-owned
    // Curator Picks are unrelated rows that must NOT be limited to one.
    uniqueIndex("songs_one_listener_pick_per_drop")
      .on(table.dropId, table.submittedByMemberId)
      .where(sql`${table.pickType} = 'listener'`),
  ]
);

export const submissions = pgTable("submissions", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id")
    .notNull()
    .references(() => clubs.id, { onDelete: "cascade" }),
  // Plain int per the README's literal field list, not a hard FK —
  // a submission targets "whatever drop is currently open," which
  // may not have a drops row yet when the cycle starts.
  dropNum: integer("drop_num").notNull(),
  link: text("link").notNull(),
  title: text("title"),
  artist: text("artist"),
  artworkUrl: text("artwork_url"),
  submittedBy: text("submitted_by"),
  submittedAt: timestamp("submitted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Set when a curator quick-adds this submission into their picks
  // (#/overview) — lets the pile show "already picked" instead of a
  // curator accidentally double-adding the same song.
  pulledAt: timestamp("pulled_at", { withTimezone: true }),
});

/**
 * Unified account model (2026-10 decision — see claude/next-build.md).
 * Curators and subscribers used to be two entirely separate tables with
 * no cross-table dedupe, which meant the same phone/email could quietly
 * exist as both a curator row and a subscriber row. They're now one
 * account type — "member" — distinguished by isCurator rather than by
 * which table a row lives in. Everyone signs up the same lightweight
 * way (name + phone/email, no password); isCurator is granted by an
 * admin (see isAdmin below), not self-served.
 *
 * Replaces the old `curators` and `subscribers` tables. See
 * `scripts/migrate-to-members.sql` for the one-time data migration this
 * requires on an existing database — this is NOT a fresh-install-only
 * change, there's real subscriber/curator data to carry over.
 */
export const members = pgTable(
  "members",
  {
    id: serial("id").primaryKey(),
    clubId: integer("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    name: text("name"),
    phone: varchar("phone", { length: 20 }), // E.164 format, e.g. +15551234567
    email: text("email"),
    // Normalized dedupe keys (src/lib/normalize.ts) — last-10-digits /
    // lowercased-trimmed. phone/email above keep whatever was typed, for
    // actually sending login codes/texts; these carry the real
    // uniqueness constraint so two concurrent signups (or a signup
    // racing a curator-grant) can't create duplicate members. Nullable +
    // unique is fine: Postgres doesn't treat NULLs as equal, so multiple
    // email-only members don't collide on a null phoneKey.
    phoneKey: varchar("phone_key", { length: 10 }),
    emailKey: text("email_key"),
    // The role flag replacing "which table is this row in." Granted
    // manually by an admin (there's no self-serve join-code path to
    // curator status anymore) — see isAdmin below.
    isCurator: boolean("is_curator").notNull().default(false),
    // Who can grant isCurator. Founder-only for now (no admin UI yet,
    // flipped directly in the data) — jacobfogelhut@gmail.com is the
    // sole admin as of this column's introduction.
    isAdmin: boolean("is_admin").notNull().default(false),
    wantsText: boolean("wants_text").notNull().default(false),
    wantsEmail: boolean("wants_email").notNull().default(false),
    smsConsent: boolean("sms_consent").notNull().default(false),
    smsOptInAt: timestamp("sms_opt_in_at", { withTimezone: true }),
    optedOut: boolean("opted_out").notNull().default(false),
    // Unguessable per-member token for the magic-link straight into the
    // unified account page — every release text/email link uses this so
    // clicking it lands you already signed in, no code needed. Typing
    // your email on the site directly still works via the emailed-code
    // login instead (see src/lib/memberSession.ts). Generated once and
    // reused for the member's lifetime; see src/lib/memberToken.ts.
    memberToken: varchar("member_token", { length: 48 }).unique(),
    // Short free-text profile blurb (2026-10 "next build" decision — see
    // claude/next-build.md). Shown on /account; nullable since most
    // existing members have never had a chance to write one.
    bio: text("bio"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique().on(table.clubId, table.phoneKey),
    unique().on(table.clubId, table.emailKey),
  ],
);

/**
 * One-time six-digit codes for the unified email-code login (replaces
 * the old curator-only phone/email code — every member logs in this
 * way now, not just curators). Not part of the README's literal data
 * model — that model doesn't cover auth at all — but needed to actually
 * implement it.
 */
export const loginCodes = pgTable("login_codes", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 6 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const curatorNotes = pgTable(
  "curator_notes",
  {
    id: serial("id").primaryKey(),
    dropId: integer("drop_id")
      .notNull()
      .references(() => drops.id, { onDelete: "cascade" }),
    curatorId: integer("curator_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    text: text("text").notNull().default(""),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.dropId, table.curatorId)],
);

/**
 * Subscriber Top 10 (design-handoff.md doesn't cover this — it's the old
 * plan.md Phase 3, confirmed still wanted, built after design-handoff's
 * nine screens). One row per subscriber's single pick for a drop's Top
 * 10 window: the window opens automatically 12 hours after that drop
 * ships and stays open for 7 days (src/lib/top10.ts), no curator action
 * needed to open or close it. The unique constraint below is what makes
 * "first submission locks in, no changes after" actually true — a
 * second attempt hits the constraint rather than needing an app-level
 * check that could race.
 *
 * No separate clubId column, same as curatorNotes above — clubId is
 * always reachable through dropId's FK, so a direct column would just
 * be a second copy of the same fact.
 */
export const top10Entries = pgTable(
  "top10_entries",
  {
    id: serial("id").primaryKey(),
    dropId: integer("drop_id")
      .notNull()
      .references(() => drops.id, { onDelete: "cascade" }),
    subscriberId: integer("subscriber_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    link: text("link").notNull(),
    // Resolved via Odesli, same best-effort pattern as submissions/songs.
    // Cross-platform duplicate votes (a Spotify link and an Apple Music
    // link for the same song) are only recognized as the same song when
    // both sides have these populated (src/lib/top10.ts's tallyTop10).
    title: text("title"),
    artist: text("artist"),
    artworkUrl: text("artwork_url"),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.dropId, table.subscriberId)],
);

export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id")
    .notNull()
    .references(() => clubs.id, { onDelete: "cascade" }),
  dropNum: integer("drop_num").notNull(),
  curatorId: integer("curator_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Song likes (2026-10 decision — see claude/next-build.md): any member
 * can like an individual song on any drop, past or current. Public —
 * the like count shows on the song, not just a private favorites list.
 * One like per member per song, enforced the same way top10Entries
 * enforces "one pick" — a real unique constraint, not just an app-level
 * check, so a double-click/retried request can't double-count.
 */
export const songLikes = pgTable(
  "song_likes",
  {
    id: serial("id").primaryKey(),
    songId: integer("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.songId, table.memberId)],
);

/**
 * A member's 1-5 rating for a drop (2026-10 "next build" decision — see
 * claude/next-build.md). One per member per drop, upsertable — the
 * unique constraint is what makes "set my rating" a plain insert-or-
 * update rather than needing an app-level race guard. 1-5 is enforced
 * at the application layer (src/lib/ratings.ts); no DB CHECK constraint
 * since every other range-like rule in this app (e.g. pick counts) is
 * app-layer only and this matches that convention.
 */
export const dropRatings = pgTable(
  "drop_ratings",
  {
    id: serial("id").primaryKey(),
    dropId: integer("drop_id")
      .notNull()
      .references(() => drops.id, { onDelete: "cascade" }),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.dropId, table.memberId)],
);

/**
 * A member's showcased "favorite drops" (2026-10 "next build" decision
 * — see claude/next-build.md), up to 5, ordered by `position`. Replace-
 * all-on-save (src/lib/favorites.ts deletes the member's existing rows
 * and inserts the new ordered set in one transaction) is simpler than
 * diffing a reorder, and this table is tiny per member so the cost is
 * negligible. Two unique constraints: one slot used once per member
 * (position), and one drop shown once per member (dropId) — a member
 * can't list the same drop twice at two positions.
 */
export const memberFavorites = pgTable(
  "member_favorites",
  {
    id: serial("id").primaryKey(),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    dropId: integer("drop_id")
      .notNull()
      .references(() => drops.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique().on(table.memberId, table.position),
    unique().on(table.memberId, table.dropId),
  ],
);

export type Club = typeof clubs.$inferSelect;
export type NewClub = typeof clubs.$inferInsert;
export type Drop = typeof drops.$inferSelect;
export type NewDrop = typeof drops.$inferInsert;
export type Song = typeof songs.$inferSelect;
export type NewSong = typeof songs.$inferInsert;
export type Submission = typeof submissions.$inferSelect;
export type NewSubmission = typeof submissions.$inferInsert;
export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
export type LoginCode = typeof loginCodes.$inferSelect;
export type NewLoginCode = typeof loginCodes.$inferInsert;
export type CuratorNote = typeof curatorNotes.$inferSelect;
export type NewCuratorNote = typeof curatorNotes.$inferInsert;
export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
export type Top10Entry = typeof top10Entries.$inferSelect;
export type NewTop10Entry = typeof top10Entries.$inferInsert;
export type SongLike = typeof songLikes.$inferSelect;
export type NewSongLike = typeof songLikes.$inferInsert;
export type DropRating = typeof dropRatings.$inferSelect;
export type NewDropRating = typeof dropRatings.$inferInsert;
export type MemberFavorite = typeof memberFavorites.$inferSelect;
export type NewMemberFavorite = typeof memberFavorites.$inferInsert;

/** Public-safe song shape — never includes submittedBy. */
export type PublicSong = Omit<Song, "submittedBy">;
