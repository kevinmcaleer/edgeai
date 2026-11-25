import type { Split } from "./types";

/** Share of pictures kept back for testing. */
export const TEST_SHARE = 0.2;

/**
 * Picks the split for the next new picture so the project stays close to 80 / 20:
 * it goes to Test whenever Test has fallen behind its share.
 */
export function nextSplit(train: number, test: number, share = TEST_SHARE): Split {
  const total = train + test + 1;
  return test < Math.round(total * share) ? "test" : "train";
}

/** Splits for a batch of new pictures, continuing from the current counts. */
export function splitsFor(count: number, train: number, test: number, share = TEST_SHARE): Split[] {
  const out: Split[] = [];
  for (let i = 0; i < count; i++) {
    const s = nextSplit(train, test, share);
    out.push(s);
    if (s === "train") train++;
    else test++;
  }
  return out;
}
