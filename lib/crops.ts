/**
 * Pure crop-data constants and helpers — no client-only dependencies, so this
 * module can be imported from server routes (e.g. `app/api/plan/route.ts`)
 * AND client components alike. The garden-context module can't host these
 * directly because it's marked `"use client"` for its Dexie usage, and
 * Turbopack mangles client-named exports when imported server-side
 * (you'll see `COMMON_HOME_CROPS.join is not a function` from the route).
 */

/**
 * Common, easy-to-grow home crops. Used as the fallback list when:
 *   - the user has no garden context yet
 *   - and there's no active plan to harvest crop names from
 *
 * Also serves as the canonical-name dictionary for `extractKnownCrops()` so
 * "tomato" / "tomatoes" both normalize to the plural form.
 *
 * Picked to read as "real garden" not "seed catalog" — duplicates would feel
 * forced, so we keep it tight.
 */
export const COMMON_HOME_CROPS: readonly string[] = [
  "tomatoes",
  "cherry tomatoes",
  "lettuce",
  "arugula",
  "spinach",
  "swiss chard",
  "kale",
  "basil",
  "mint",
  "cilantro",
  "parsley",
  "chives",
  "rosemary",
  "thyme",
  "bell peppers",
  "hot peppers",
  "cucumbers",
  "green beans",
  "snap peas",
  "zucchini",
  "summer squash",
  "carrots",
  "radishes",
  "beets",
  "onions",
  "garlic",
  "broccoli",
  "cauliflower",
  "strawberries",
  "blueberries",
];

/**
 * Match a free-text blob against the known crop dictionary. Looks for both
 * singular and plural forms ("tomato" / "tomatoes") so the result is always
 * in the canonical plural form from the dictionary.
 */
export function extractKnownCrops(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const crop of COMMON_HOME_CROPS) {
    const root = crop.replace(/(es|s)$/, "");
    const regex = new RegExp(`\\b${root}(es|s)?\\b`, "i");
    if (regex.test(lower)) found.add(crop);
  }
  return Array.from(found);
}

/**
 * Pluck plant words from shopping-list / task-style text using surface
 * patterns ("X seeds", "X seedlings", "X starts", "X plants", "X cuttings").
 * Catches crops not yet in `COMMON_HOME_CROPS` so the vision prompt can show
 * what the user is actually growing — e.g. a plan with "okra seeds" or
 * "leek starts" still influences the render.
 *
 * Returns lowercase canonical phrases (the captured noun, plus "s" if the
 * source word was singular) so the caller can pass them straight into the
 * image prompt without further normalization.
 */
export function extractCropsByPattern(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  // "1 lb bush bean seeds (Provider variety)" → "bush bean"
  // "Cherokee Purple tomato seedlings"        → "Cherokee Purple tomato"
  // "garlic starts"                           → "garlic"
  const re = /([a-z][a-z\s'-]{1,40}?)\s+(seeds|seedlings|starts|plants|transplants|bulbs|cuttings|tubers)\b/g;
  for (const match of lower.matchAll(re)) {
    const noun = match[1].replace(/^(\d+\s*(lb|lbs|oz|cu\.?|cu)\s+)?/, "").trim();
    const cleaned = noun.replace(/^(a|the|some|fresh|organic|heirloom|bush|pole|cherry)\s+/, "").trim();
    if (cleaned.length < 2) continue;
    // Skip non-plant nouns that the pattern accidentally catches.
    if (/(soil|mulch|compost|fertilizer|stake|trellis|tool|bag|pack)/.test(cleaned)) continue;
    found.add(pluralize(cleaned));
  }
  return Array.from(found);
}

function pluralize(noun: string): string {
  if (/(s|es)$/.test(noun)) return noun;
  if (/(sh|ch|x|z|s)$/.test(noun)) return `${noun}es`;
  if (/[^aeiou]y$/.test(noun)) return `${noun.slice(0, -1)}ies`;
  return `${noun}s`;
}
