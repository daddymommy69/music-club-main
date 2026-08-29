// Seed a sample club with drops/songs/curators/subscribers so pages
// can be visually verified against real data. Local dev only — never
// run against production.
//
//   npx tsx scripts/seed.ts
import "dotenv/config";
import { getDb } from "../src/db/client";
import {
  clubs,
  drops,
  songs,
  curators,
  curatorNotes,
  subscribers,
  submissions,
} from "../src/db/schema";

async function main() {
  const db = getDb();

  console.log("Clearing existing data...");
  await db.delete(curatorNotes);
  await db.delete(songs);
  await db.delete(submissions);
  await db.delete(curators);
  await db.delete(subscribers);
  await db.delete(drops);
  await db.delete(clubs);

  console.log("Creating club...");
  const [club] = await db
    .insert(clubs)
    .values({
      name: "Gooberz Music Club",
      joinCode: "GOOBERZ-4821",
      cycle: "every45",
    })
    .returning();

  console.log("Creating curators...");
  const [nico, june, sam] = await db
    .insert(curators)
    .values([
      { clubId: club.id, name: "nico", phone: "+15551230001" },
      { clubId: club.id, name: "june", phone: "+15551230002" },
      { clubId: club.id, name: "sam", phone: "+15551230003" },
    ])
    .returning();

  console.log("Creating subscribers...");
  await db.insert(subscribers).values(
    Array.from({ length: 34 }).map((_, i) => ({
      clubId: club.id,
      name: `subscriber ${i + 1}`,
      phone: `+1555999${String(1000 + i)}`,
      wantsText: true,
      wantsEmail: i % 3 === 0,
      smsConsent: true,
    }))
  );

  const dropSeeds = [
    {
      num: 5,
      title: "Late summer, low ceiling",
      songs: [
        { title: "Windows Down", artist: "Coastal Static", curatorCredit: "nico" },
        { title: "Paper Cranes", artist: "Milo Voss", curatorCredit: null },
        { title: "Slow Fade", artist: "Aurelie", curatorCredit: "june" },
        { title: "Concrete Bloom", artist: "The Understudies", curatorCredit: "sam" },
        { title: "Halfway Home", artist: "Reva Lune", curatorCredit: null },
      ],
      notes: {
        nico: "This one's for the drive with no destination. Started with Windows Down and built out from there.",
        june: "Slow Fade almost didn't make the cut — glad it did.",
        sam: "Trying to capture that specific August feeling. Hope it landed.",
      },
    },
    {
      num: 6,
      title: "Twelve songs, one long exhale",
      songs: [
        { title: "Static Bloom", artist: "Yew", curatorCredit: "sam" },
        { title: "Low Light", artist: "Marren", curatorCredit: null },
        { title: "Coastline", artist: "Oleander Drive", curatorCredit: "nico" },
        { title: "Nothing New", artist: "Faye Ito", curatorCredit: null },
        { title: "Quiet Hours", artist: "The Understudies", curatorCredit: "june" },
        { title: "Afterglow", artist: "Coastal Static", curatorCredit: null },
      ],
      notes: {
        nico: "Kept it mellow this round.",
        june: "Quiet Hours has been on repeat all month.",
        sam: "A little more downtempo than usual — let us know what you think.",
      },
    },
    {
      num: 7,
      title: "Windows down, no destination",
      songs: [
        { title: "Windows Down", artist: "Coastal Static", curatorCredit: "nico" },
        { title: "Backroads", artist: "Reva Lune", curatorCredit: null },
        { title: "Static Bloom", artist: "Yew", curatorCredit: "sam" },
        { title: "Paper Cranes", artist: "Milo Voss", curatorCredit: "june" },
        { title: "Halfway Home", artist: "Reva Lune", curatorCredit: null },
        { title: "Afterglow", artist: "Coastal Static", curatorCredit: null },
        { title: "Nothing New", artist: "Faye Ito", curatorCredit: "nico" },
      ],
      notes: {
        nico: "This is the drive-with-no-destination one. Windows Down opens it for a reason.",
        june: "Paper Cranes came in from a submission and it was too good not to feature.",
        sam: "Closed it out with Nothing New — felt like the right note to end on.",
      },
    },
  ];

  console.log("Creating drops, songs, and notes...");
  for (const seed of dropSeeds) {
    const [drop] = await db
      .insert(drops)
      .values({
        clubId: club.id,
        num: seed.num,
        title: seed.title,
        publishedAt: new Date(Date.now() - (7 - seed.num) * 12 * 24 * 60 * 60 * 1000),
        spotifyUrl: "https://open.spotify.com/playlist/example",
        appleUrl: "https://music.apple.com/playlist/example",
      })
      .returning();

    await db.insert(songs).values(
      seed.songs.map((s, i) => ({
        dropId: drop.id,
        title: s.title,
        artist: s.artist,
        curatorCredit: s.curatorCredit,
        submittedBy: s.curatorCredit ? null : `subscriber ${(i % 34) + 1}`,
        position: i,
      }))
    );

    const curatorByName = { nico, june, sam } as const;
    await db.insert(curatorNotes).values(
      (Object.entries(seed.notes) as [keyof typeof curatorByName, string][]).map(
        ([name, text]) => ({
          dropId: drop.id,
          curatorId: curatorByName[name].id,
          text,
        })
      )
    );
  }

  console.log("Creating drop 8 (unpublished, private, in progress)...");
  const [drop8] = await db
    .insert(drops)
    .values({ clubId: club.id, num: 8, title: null })
    .returning();
  await db.insert(songs).values([
    { dropId: drop8.id, title: "Half Empty House", artist: "Oleander Drive", curatorCredit: "june", position: 0 },
    { dropId: drop8.id, title: "New Skin", artist: "Faye Ito", curatorCredit: null, submittedBy: "subscriber 9", position: 1 },
  ]);

  console.log("Creating open submissions (pile for drop 8)...");
  await db.insert(submissions).values([
    { clubId: club.id, dropNum: 8, link: "https://open.spotify.com/track/example1", title: "Radio Silence", artist: "Marren", submittedBy: "subscriber 3" },
    { clubId: club.id, dropNum: 8, link: "https://open.spotify.com/track/example2", title: "Blue Hour", artist: "Yew", submittedBy: "subscriber 21" },
  ]);

  console.log("Done.");
  console.log(`Club: ${club.name} (id ${club.id})`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
