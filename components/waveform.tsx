/**
 * 25-bar audio waveform visualization. Pure CSS animation — no JS or audio
 * analysis. Each bar gets a fixed height + animation-delay tuple from the
 * design spec, producing a hand-tuned "voice ribbon" shape.
 */

interface BarSpec {
  height: number;
  delay: number;
}

const INLINE_BARS: BarSpec[] = [
  { height: 12, delay: 0.0 },
  { height: 20, delay: 0.06 },
  { height: 28, delay: 0.12 },
  { height: 36, delay: 0.18 },
  { height: 44, delay: 0.24 },
  { height: 38, delay: 0.30 },
  { height: 32, delay: 0.36 },
  { height: 26, delay: 0.42 },
  { height: 36, delay: 0.18 },
  { height: 44, delay: 0.24 },
  { height: 30, delay: 0.30 },
  { height: 22, delay: 0.36 },
  { height: 36, delay: 0.42 },
  { height: 28, delay: 0.48 },
  { height: 20, delay: 0.54 },
  { height: 14, delay: 0.60 },
  { height: 24, delay: 0.36 },
  { height: 32, delay: 0.42 },
  { height: 26, delay: 0.48 },
  { height: 18, delay: 0.54 },
  { height: 28, delay: 0.30 },
  { height: 36, delay: 0.24 },
  { height: 30, delay: 0.18 },
  { height: 22, delay: 0.12 },
  { height: 14, delay: 0.06 },
];

const MODAL_BARS: BarSpec[] = [
  { height: 18, delay: 0.00 },
  { height: 28, delay: 0.05 },
  { height: 40, delay: 0.10 },
  { height: 52, delay: 0.15 },
  { height: 64, delay: 0.20 },
  { height: 56, delay: 0.25 },
  { height: 44, delay: 0.30 },
  { height: 32, delay: 0.35 },
  { height: 48, delay: 0.20 },
  { height: 60, delay: 0.25 },
  { height: 38, delay: 0.30 },
  { height: 26, delay: 0.35 },
  { height: 50, delay: 0.40 },
  { height: 38, delay: 0.45 },
  { height: 24, delay: 0.50 },
  { height: 16, delay: 0.55 },
  { height: 32, delay: 0.30 },
  { height: 44, delay: 0.35 },
  { height: 36, delay: 0.40 },
  { height: 22, delay: 0.45 },
  { height: 36, delay: 0.20 },
  { height: 48, delay: 0.15 },
  { height: 38, delay: 0.10 },
  { height: 26, delay: 0.05 },
  { height: 16, delay: 0.00 },
];

interface WaveformProps {
  variant?: "inline" | "modal";
  className?: string;
}

export function Waveform({ variant = "inline", className }: WaveformProps) {
  const isModal = variant === "modal";
  const bars = isModal ? MODAL_BARS : INLINE_BARS;
  const barWidth = isModal ? 5 : 4;
  const barGap = isModal ? 5 : 4;
  const containerHeight = isModal ? 80 : 56;
  const containerWidth = isModal ? "100%" : 320;
  const maxWidth = isModal ? 480 : undefined;

  return (
    <div
      className={["flex items-center justify-center", className ?? ""].join(" ")}
      style={{
        width: containerWidth,
        height: containerHeight,
        maxWidth,
        gap: barGap,
      }}
    >
      {bars.map((b, i) => (
        <span
          key={i}
          style={{
            width: barWidth,
            height: b.height,
            background: isModal
              ? "linear-gradient(180deg, var(--color-lime), var(--color-sage))"
              : "linear-gradient(180deg, var(--color-lime), var(--color-lime-deep))",
            borderRadius: 100,
            animation: `wave-bounce 0.9s ease-in-out ${b.delay}s infinite`,
            transformOrigin: "center",
          }}
        />
      ))}
    </div>
  );
}
