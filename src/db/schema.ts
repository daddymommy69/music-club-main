import {
  pgTable,
  serial,
  text,
  varchar,
  boolean,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";

/**
 * Phase 0 schema — just enough to run the core loop:
 * people sign up, and a scheduled job sends them the current
 * cycle's (manually curated) Apple Music playlist link.
 *
 * Later phases (submissions, curators, Top 10 votes) get their
 * own tables added here without touching these two.
 */

export const subscribers = pgTable("subscribers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: varchar("phone", { length: 20 }), // E.164 format, e.g. +15551234567
  email: text("email"),
  wantsText: boolean("wants_text").notNull().default(false),
  wantsEmail: boolean("wants_email").notNull().default(false),
  smsOptInAt: timestamp("sms_opt_in_at", { withTimezone: true }),
  optedOut: boolean("opted_out").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const cycles = pgTable("cycles", {
  id: serial("id").primaryKey(),
  // Sequential cycle number, starting at 1.
  cycleNumber: integer("cycle_number").notNull(),
  // When this cycle's 45-day window started.
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  // Filled in once the release actually goes out.
  sentAt: timestamp("sent_at", { withTimezone: true }),
  appleMusicUrl: text("apple_music_url"),
  spotifyUrl: text("spotify_url"), // used starting Phase 1
  writeUp: text("write_up"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Subscriber = typeof subscribers.$inferSelect;
export type NewSubscriber = typeof subscribers.$inferInsert;
export type Cycle = typeof cycles.$inferSelect;
export type NewCycle = typeof cycles.$inferInsert;
