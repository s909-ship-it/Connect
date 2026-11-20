/* Tiers: ranks, like in a game, that show at a glance how much verified work stands behind someone.
   A tier comes from earned credit, which only verified work gives (shipped projects, accurate reviews, vouches from
   teammates, signed-off commissions), never gifts or spending. From Gold up a tier also needs shipped projects, so the
   top ranks stand for things built, not credit collected. Change the levels here. */
export type Tier = { id: string; name: string; min: number; shipped: number; color: string; note: string };

export const TIERS: Tier[] = [
  { id: "rookie", name: "Rookie", min: 0, shipped: 0, color: "gray", note: "Verified and getting started" },
  { id: "bronze", name: "Bronze", min: 50, shipped: 0, color: "bronze", note: "Enough earned credit to review other people's projects" },
  { id: "silver", name: "Silver", min: 150, shipped: 0, color: "silver", note: "A steady record of verified work" },
  { id: "gold", name: "Gold", min: 300, shipped: 2, color: "gold", note: "Has shipped more than once" },
  { id: "platinum", name: "Platinum", min: 500, shipped: 3, color: "platinum", note: "A builder teams go looking for" },
  { id: "diamond", name: "Diamond", min: 800, shipped: 5, color: "diamond", note: "Ships again and again, signed by teammates and reviewers" },
  { id: "legend", name: "Legend", min: 1200, shipped: 8, color: "legend", note: "Among the most proven builders in the community" },
];

export type TierStatus = {
  tier: Tier; index: number; next: Tier | null;
  /* 0 to 1: how far along the way to the next tier, counting both credit and shipped projects. */
  progress: number;
  /* What is still missing for the next tier, in words. Empty at the top. */
  needs: string[];
};

export function tierFor(earned: number, shipped: number): TierStatus {
  let index = 0;
  for (let i = 0; i < TIERS.length; i++) if (earned >= TIERS[i].min && shipped >= TIERS[i].shipped) index = i;
  const tier = TIERS[index], next = TIERS[index + 1] ?? null;
  if (!next) return { tier, index, next, progress: 1, needs: [] };
  const credit = Math.min(1, Math.max(0, (earned - tier.min) / (next.min - tier.min)));
  const ships = next.shipped > tier.shipped ? Math.min(1, Math.max(0, (shipped - tier.shipped) / (next.shipped - tier.shipped))) : 1;
  const needs: string[] = [];
  if (earned < next.min) needs.push(`${next.min - earned} more credit`);
  if (shipped < next.shipped) needs.push(`${next.shipped - shipped} more shipped project${next.shipped - shipped === 1 ? "" : "s"}`);
  return { tier, index, next, progress: Math.min(credit, ships), needs };
}
