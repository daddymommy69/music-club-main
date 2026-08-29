import type { SignupContext } from "@/lib/signup";

/**
 * The "proof" hero variant from the handoff's `signupHero` control: a
 * big drop numeral beside two short countdown lines, with a
 * subscriber-count line underneath — hidden below 10 subscribers so a
 * brand-new club doesn't have to advertise a small number.
 */
export default function SignupHero({
  nextDropNum,
  daysUntilNext,
  isManual,
  subscriberCount,
}: Pick<SignupContext, "nextDropNum" | "daysUntilNext" | "isManual" | "subscriberCount">) {
  const numeral = String(nextDropNum).padStart(2, "0");

  let line1: string;
  let line2: string;
  if (isManual) {
    line1 = `drop ${numeral} ships`;
    line2 = "whenever it's ready";
  } else if (daysUntilNext === null) {
    line1 = `drop ${numeral}`;
    line2 = "coming soon";
  } else if (daysUntilNext === 0) {
    line1 = `drop ${numeral}`;
    line2 = "ships today";
  } else {
    line1 = `drop ${numeral} ships in`;
    line2 = `${daysUntilNext} day${daysUntilNext === 1 ? "" : "s"}`;
  }

  return (
    <div className="signup-hero gz-up">
      <div className="signup-hero-row">
        <div className="numeral">{numeral}</div>
        <div className="signup-hero-lines">
          <div>{line1}</div>
          <div>{line2}</div>
        </div>
      </div>
      {subscriberCount >= 10 && (
        <div className="mut signup-hero-count">{subscriberCount} people get this</div>
      )}
    </div>
  );
}
