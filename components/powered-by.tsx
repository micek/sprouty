"use client";

import Image from "next/image";

/**
 * "Powered by" attribution strip — a continuously-scrolling row of brand
 * wordmarks rendered grayscale to read as a single visual unit.
 *
 * Loop: the brand list is duplicated in DOM and the inner track animates from
 * `translateX(-50%)` → `translateX(0)`, so as the first copy exits to the
 * right the second copy slides into its place seamlessly.
 *
 * Alignment: every brand is wrapped in a fixed-height (`MARK_HEIGHT_PX`) flex
 * box with `items-center`, so SVGs with mismatched intrinsic baselines and
 * text fallbacks all share the same horizontal axis on the strip.
 *
 * Duplicate-visibility fix: the edges fade ~22% on each side via a CSS mask,
 * so the duplicated copy that sits adjacent to the primary copy is always
 * fading out before reaching the visible center band of the strip.
 */

const MARK_HEIGHT_PX = 28;

type Brand =
  | { name: string; src: string; alt: string }
  | { name: string; text: string; alt: string };

const BRANDS: Brand[] = [
  { name: "qdrant", src: "/logos/qdrant.svg", alt: "Qdrant" },
  { name: "mistral", text: "Mistral", alt: "Mistral AI" },
  { name: "livekit", text: "LiveKit", alt: "LiveKit" },
  { name: "trigger", text: "trigger.dev", alt: "trigger.dev" },
  { name: "openrouter", text: "OpenRouter", alt: "OpenRouter" },
  { name: "gemini", src: "/logos/gemini.svg", alt: "Google Gemini (Nano Banana)" },
  { name: "openai", src: "/logos/openai.svg", alt: "OpenAI" },
];

export function PoweredBy() {
  return (
    <section
      aria-labelledby="powered-by-heading"
      className="relative mb-6 overflow-hidden rounded-[32px] border px-8 py-10 max-[700px]:px-5 max-[700px]:py-8"
      style={{
        background: "var(--color-card)",
        borderColor: "var(--color-rule)",
      }}
    >
      <div
        id="powered-by-heading"
        className="mb-7 flex items-center justify-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em]"
        style={{ color: "var(--color-ink-faded)" }}
      >
        <span
          aria-hidden
          className="inline-block"
          style={{ width: 28, height: 1, background: "var(--color-rule)" }}
        />
        Sprouty is powered by
        <span
          aria-hidden
          className="inline-block"
          style={{ width: 28, height: 1, background: "var(--color-rule)" }}
        />
      </div>

      <div
        className="relative"
        style={{ maskImage: FADE_MASK, WebkitMaskImage: FADE_MASK }}
      >
        <div
          className="powered-by-track flex w-max"
          style={{ animation: "powered-by-scroll 42s linear infinite" }}
        >
          {/* Two identical copies for the seamless loop */}
          {[0, 1].map((copy) => (
            <div
              key={copy}
              className="flex flex-shrink-0 items-center gap-24 pr-24 max-[700px]:gap-16 max-[700px]:pr-16"
              aria-hidden={copy === 1}
            >
              {BRANDS.map((b) => (
                <BrandMark key={`${copy}-${b.name}`} brand={b} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BrandMark({ brand }: { brand: Brand }) {
  // Shared grayscale + opacity treatment so the row reads as one cohesive
  // credit strip rather than a collage of competing brand colors.
  const treatment: React.CSSProperties = {
    filter: "grayscale(100%) brightness(0.55) contrast(1.1)",
    opacity: 0.7,
  };

  // Fixed-height flex box guarantees every mark sits on the same baseline,
  // regardless of the SVG's intrinsic top/bottom whitespace.
  return (
    <div
      className="flex items-center justify-center"
      style={{ height: MARK_HEIGHT_PX }}
    >
      {"src" in brand ? (
        <Image
          src={brand.src}
          alt={brand.alt}
          height={MARK_HEIGHT_PX}
          width={MARK_HEIGHT_PX * 4}
          style={{
            ...treatment,
            maxHeight: MARK_HEIGHT_PX,
            height: "auto",
            width: "auto",
            objectFit: "contain",
          }}
          unoptimized
        />
      ) : (
        <span
          aria-label={brand.alt}
          className="font-tight whitespace-nowrap font-bold leading-none tracking-tight"
          style={{
            ...treatment,
            color: "var(--color-ink-soft)",
            fontSize: MARK_HEIGHT_PX - 4,
          }}
        >
          {brand.text}
        </span>
      )}
    </div>
  );
}

/** Wider soft edges so a duplicate brand from the second copy is fully faded
    out before it reaches the visible center band. */
const FADE_MASK =
  "linear-gradient(to right, transparent 0%, #000 22%, #000 78%, transparent 100%)";
