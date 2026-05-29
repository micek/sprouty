/**
 * Image-generation prompt for Garden Vision.
 *
 * Tone choices, locked in by Cory:
 *   - Photorealistic, "careful iPhone photo" — no HDR, no cartoon.
 *   - Pristine / curated vibe (Pinterest-ready, no clutter).
 *   - When a reference photo is provided, match its EXACT geometry AND its
 *     lighting / time of day / weather. Don't "improve" the lighting.
 *   - Crops are dynamic — pulled from the user's GardenContext when available,
 *     else extracted from the active plan, else common home crops.
 *
 * Server-side module — imported by `app/api/vision/route.ts`. No "use client"
 * directive so it can ship in the route's Node bundle.
 */

const SYSTEM_PROMPT = [
  "You are an image generator producing photorealistic photographs of home vegetable gardens for the Sprouty gardening app.",
  "The output must look like a careful, well-composed iPhone 15 photo — crisp focus, natural depth of field, real-world color temperature.",
  "Visual style: pristine and curated. Plants are healthy, neatly arranged, beds are clean and freshly mulched, no weeds, no debris, no garden tools or hoses left out. Pinterest-ready cleanliness — but the plants themselves are real (slight leaf variation, real shadows, no plastic perfection).",
  "Output dimensions: up to 2000 × 2000 pixels (1:1 square aspect ratio). Do not exceed 2000 × 2000.",
  "Strictly avoid: HDR, over-saturation, dramatic backlighting, lens flares, halos, magical glows, cartoon or illustration styles, painterly rendering, AI gloss, plastic-looking foliage, text overlays, watermarks, captions, signage, people, hands, animals, multi-panel layouts, before/after split-screens.",
].join(" ");

const REFERENCE_BLOCK = [
  "A reference photo of the user's actual space is included. Treat it as an architectural and atmospheric blueprint:",
  "  • PRESERVE THE EXACT GEOMETRY of the space — same walls, fences, railings, doors, posts, ground surface, drainage, window placement. Do not invent or relocate structures.",
  "  • Match the camera angle, framing, and field of view of the reference precisely.",
  "  • Match the lighting direction, time of day, weather, and color temperature of the reference. If the reference was shot at midday with hard shadows, the generated photo has midday lighting with hard shadows. If it was at golden hour, generate at golden hour. Do not 'improve' the lighting.",
  "  • Place the garden naturally inside that space — raised beds on flat ground, container plants on patios and balconies, trellises and vertical planters against existing walls.",
].join("\n");

const NO_REFERENCE_BLOCK = [
  "No reference photo was provided. Generate a representative thriving home garden:",
  "  • Setting: a modest backyard or patio with cedar raised beds against a wood fence, photographed at standing height in late afternoon natural light.",
  "  • Style still pristine and curated — magazine-quality cleanliness, healthy plants.",
].join("\n");

export interface VisionPromptInput {
  /** Free-text plan context appended to the user message (optional). */
  extraContext?: string;
  /** Crops the user is growing — picks the in-frame plants. */
  crops: string[];
  /** Whether a reference "before" photo accompanies the request. */
  hasReferencePhoto: boolean;
  /** Plain-language space description from GardenContext, if available. */
  spaceDescription?: string;
  /** Free-form user goals from GardenContext, if available. */
  goals?: string[];
  /** Region / climate hint from GardenContext, if available. */
  region?: string;
  /** Hours-per-week commitment — informs garden density. */
  hoursPerWeek?: number;
}

export interface BuiltVisionPrompt {
  system: string;
  user: string;
}

/**
 * Build the {system, user} pair that gets sent to the image model.
 *
 * Layered context — anything we know about the user's garden bleeds into the
 * prompt so the render feels like _their_ garden, not a stock photo:
 *   - crops drive the in-frame plants
 *   - spaceDescription steers framing / scale (balcony vs. yard)
 *   - region nudges climate cues (palms vs. evergreens) without overriding
 *     the reference photo's lighting
 *   - hoursPerWeek hints at density (low hours = compact, well-mulched, easy
 *     to maintain; high hours = lush, multiple varieties, vertical structures)
 *   - goals show up in the framing notes ("tomato-forward", "salad greens
 *     prominent") to colour the composition
 *
 * Reference-photo handling toggles between the two scene blocks above; when a
 * reference is present, geometry/lighting still come from the photo and these
 * fields only inform what _grows_ inside it.
 */
export function buildVisionPrompt(input: VisionPromptInput): BuiltVisionPrompt {
  const cropLine = input.crops.length
    ? `Crops to include: ${input.crops.join(", ")}. Pick the subset that fits the visible space — small balcony gets compact varieties in pots, larger yard gets full beds with the whole list. Do not include crops outside this list.`
    : "Crops: a tasteful mix of common home-garden vegetables and herbs (tomatoes, leafy greens, peppers, beans, basil). Pick what fits the space.";

  const userParts: string[] = [
    "Generate a photorealistic Week 12 'after' photo of this user's home vegetable garden.",
    cropLine,
    input.hasReferencePhoto ? REFERENCE_BLOCK : NO_REFERENCE_BLOCK,
    "Composition: 1:1 square aspect ratio. A single cohesive photograph.",
  ];

  const personalLines: string[] = [];
  if (input.spaceDescription?.trim()) {
    personalLines.push(`- Space: ${input.spaceDescription.trim()}`);
  }
  if (input.region?.trim()) {
    personalLines.push(
      `- Region: ${input.region.trim()}. Use plant varieties and climate cues consistent with this region — but DO NOT override the reference photo's lighting or weather.`,
    );
  }
  if (typeof input.hoursPerWeek === "number" && input.hoursPerWeek > 0) {
    const density =
      input.hoursPerWeek <= 2
        ? "low-maintenance density: compact, well-mulched, no sprawling vines."
        : input.hoursPerWeek <= 5
          ? "moderate density: tidy beds, a few staked or trellised crops."
          : "lush, fully-tended density: multiple varieties, vertical structures, climbing crops.";
    personalLines.push(`- Care budget: ${input.hoursPerWeek} hours per week. ${density}`);
  }
  if (input.goals?.length) {
    personalLines.push(
      `- Goals (let these influence framing and crop prominence): ${input.goals.join("; ")}.`,
    );
  }
  if (personalLines.length) {
    userParts.push(["User's garden context:", ...personalLines].join("\n"));
  }

  if (input.extraContext?.trim()) {
    userParts.push(`Plan notes from the user: ${input.extraContext.trim()}`);
  }

  return {
    system: SYSTEM_PROMPT,
    user: userParts.join("\n\n"),
  };
}
