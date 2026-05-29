import type { CSSProperties } from "react";

export type SproutState = "idle" | "listening";

interface SproutCharacterProps {
  state?: SproutState;
  /** Width in px. Height auto-derives at 320/280 aspect. */
  size?: number;
  className?: string;
  onClick?: () => void;
}

/**
 * Sprout — the voice-agent character.
 *
 * Matches `.local/sprout_design_04_listening.html`. Pure CSS animations (no JS) so it
 * holds 60fps on iPhone SE. Default 280×320 px in idle. Pass `state="listening"`
 * to swap into the watering-can + droplets + dark-soil + lime-ring variant.
 */
export function SproutCharacter({
  state = "idle",
  size = 280,
  className,
  onClick,
}: SproutCharacterProps) {
  const isListening = state === "listening";
  const height = Math.round((size * 320) / 280);

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={[
        "relative transition-transform",
        onClick ? "cursor-pointer hover:scale-[1.04] active:scale-[0.98]" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        {
          width: size,
          height,
          transitionDuration: "0.3s",
          transitionTimingFunction: "cubic-bezier(0.2, 0.8, 0.2, 1)",
          zIndex: 1,
        } as CSSProperties
      }
    >
      <WateringCan listening={isListening} />
      <WaterDrops listening={isListening} />
      <Pot listening={isListening} />
      <Leaf side="left" listening={isListening} />
      <Leaf side="right" listening={isListening} />
      <SproutBody listening={isListening} />
    </div>
  );
}

/* ─── pot ─── */

function Pot({ listening }: { listening: boolean }) {
  return (
    <div
      className="absolute bottom-0 left-1/2 -translate-x-1/2"
      style={{ width: 180, height: 100, zIndex: 2 }}
    >
      <div
        className="absolute left-0 right-0 top-0 rounded-[5px]"
        style={{
          height: 22,
          background: "linear-gradient(180deg, #c87858 0%, #a55a40 100%)",
          boxShadow:
            "inset 0 -2px 4px rgba(0, 0, 0, 0.18), inset 0 2px 4px rgba(255, 200, 160, 0.2)",
        }}
      >
        <Soil listening={listening} />
      </div>
      <div
        className="absolute bottom-0"
        style={{
          width: "100%",
          height: 84,
          background: "linear-gradient(180deg, #c4825a 0%, #a55a40 100%)",
          borderRadius: "6px 6px 56px 56px / 6px 6px 70px 70px",
          boxShadow:
            "inset -8px -8px 20px rgba(74, 32, 18, 0.18), inset 4px 4px 12px rgba(255, 200, 160, 0.15), 0 12px 32px rgba(165, 90, 64, 0.25)",
        }}
      />
    </div>
  );
}

function Soil({ listening }: { listening: boolean }) {
  return (
    <div
      className="absolute"
      style={{
        top: 18,
        left: 6,
        right: 6,
        height: 14,
        background: listening
          ? "linear-gradient(180deg, #2d1a0f 0%, #1a0d05 100%)"
          : "linear-gradient(180deg, #5c3920 0%, #3d2614 100%)",
        borderRadius: "2px 2px 30px 30px",
        boxShadow: listening
          ? "inset 0 1px 3px rgba(0, 0, 0, 0.5), 0 0 12px rgba(109, 180, 212, 0.4)"
          : "inset 0 1px 3px rgba(0, 0, 0, 0.4)",
        transition: "background 0.6s ease, box-shadow 0.6s ease",
      }}
    >
      {/* Water shimmer line — only visible while listening */}
      {listening && (
        <span
          className="absolute"
          style={{
            top: 4,
            left: "20%",
            right: "20%",
            height: 2,
            background: "rgba(109, 180, 212, 0.4)",
            borderRadius: 2,
            animation: "water-shimmer 2s ease-in-out infinite",
          }}
        />
      )}
    </div>
  );
}

/* ─── leaves ─── */

function Leaf({ side, listening }: { side: "left" | "right"; listening: boolean }) {
  const isLeft = side === "left";
  const idleAnim = isLeft ? "leaf-sway-left 5s" : "leaf-sway-right 5s";
  const listeningAnim = isLeft
    ? "leaf-sway-left-fast 1.6s"
    : "leaf-sway-right-fast 1.6s";

  return (
    <div
      className="absolute"
      style={{
        top: 70,
        [isLeft ? "left" : "right"]: 20,
        width: 92,
        height: 110,
        background: "linear-gradient(135deg, #5a8a3a 0%, #2d5a2c 100%)",
        borderRadius: "0 100% 0 100%",
        filter: listening
          ? "drop-shadow(0 6px 16px rgba(90, 138, 58, 0.45))"
          : "drop-shadow(0 6px 12px rgba(45, 90, 44, 0.25))",
        transformOrigin: isLeft ? "bottom right" : "bottom left",
        animation: `${listening ? listeningAnim : idleAnim} ease-in-out infinite`,
        transition: "filter 0.3s ease",
      }}
    >
      <div
        className="absolute"
        style={{
          top: "20%",
          left: "15%",
          right: "15%",
          bottom: "20%",
          borderLeft: "1px solid rgba(255, 255, 255, 0.15)",
          borderRadius: "0 100% 0 100%",
        }}
      />
    </div>
  );
}

/* ─── body + face ─── */

function SproutBody({ listening }: { listening: boolean }) {
  return (
    <div
      className="absolute left-1/2 rounded-full"
      style={{
        bottom: 78,
        transform: "translateX(-50%)",
        width: 144,
        height: 144,
        background:
          "radial-gradient(circle at 30% 28%, #d8eb78 0%, #b8d97a 35%, #8fb340 80%, #7ba63d 100%)",
        boxShadow: listening
          ? "inset -12px -12px 32px rgba(45, 90, 44, 0.18), inset 6px 6px 18px rgba(255, 255, 255, 0.3), 0 0 0 6px rgba(196, 221, 88, 0.2), 0 0 0 12px rgba(196, 221, 88, 0.1), 0 16px 48px rgba(143, 179, 64, 0.5)"
          : "inset -12px -12px 32px rgba(45, 90, 44, 0.18), inset 6px 6px 18px rgba(255, 255, 255, 0.25), 0 16px 36px rgba(143, 179, 64, 0.35)",
        animation: listening
          ? "breathe-fast 1.2s ease-in-out infinite"
          : "breathe 4s ease-in-out infinite",
        transition: "box-shadow 0.4s ease",
        zIndex: 3,
      }}
    >
      <SproutFace listening={listening} />
    </div>
  );
}

function SproutFace({ listening }: { listening: boolean }) {
  return (
    <div
      className="absolute left-1/2 text-center"
      style={{ top: "48%", transform: "translateX(-50%)", width: 90 }}
    >
      <Eye listening={listening} />
      <Eye listening={listening} />
      <div
        className="mx-auto"
        style={{
          marginTop: 7,
          width: listening ? 24 : 18,
          height: listening ? 13 : 9,
          border: "2.5px solid #1a2418",
          borderTop: "none",
          borderRadius: listening ? "0 0 24px 24px" : "0 0 18px 18px",
          transition: "all 0.3s ease",
        }}
      />
    </div>
  );
}

function Eye({ listening }: { listening: boolean }) {
  return (
    <span
      className="relative inline-block"
      style={{
        width: 11,
        height: 11,
        background: "#1a2418",
        borderRadius: "50%",
        margin: "0 9px",
        animation: listening
          ? "blink-fast 3s ease-in-out infinite"
          : "blink 5s ease-in-out infinite",
      }}
    >
      <span
        className="absolute"
        style={{
          top: 2,
          right: 2,
          width: 4,
          height: 4,
          background: "rgba(255, 255, 255, 0.8)",
          borderRadius: "50%",
        }}
      />
    </span>
  );
}

/* ─── watering can + drops ─── */

function WateringCan({ listening }: { listening: boolean }) {
  return (
    <div
      className="absolute"
      style={{
        top: -10,
        right: -20,
        width: 80,
        height: 70,
        opacity: listening ? 1 : 0,
        transform: listening
          ? "translateX(0) translateY(0) rotate(35deg)"
          : "translateX(40px) translateY(-10px) rotate(20deg)",
        animation: listening ? "water-tilt 2.4s ease-in-out infinite" : undefined,
        transition: "all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)",
        zIndex: 4,
      }}
    >
      {/* can body */}
      <div
        className="absolute"
        style={{
          bottom: 0,
          left: 8,
          width: 50,
          height: 44,
          background: "linear-gradient(180deg, #c4dd58, #8fb340)",
          borderRadius: "6px 6px 14px 14px",
          boxShadow:
            "inset -4px -4px 8px rgba(45, 90, 44, 0.2), inset 2px 2px 4px rgba(255, 255, 255, 0.3), 0 4px 12px rgba(143, 179, 64, 0.3)",
        }}
      />
      {/* handle */}
      <div
        className="absolute"
        style={{
          top: -2 + 0,
          left: 12 + 8,
          width: 28,
          height: 18,
          border: "4px solid var(--color-lime-deep)",
          borderBottom: "none",
          borderRadius: "14px 14px 0 0",
          background: "transparent",
        }}
      />
      {/* spout */}
      <div
        className="absolute"
        style={{
          bottom: 12,
          left: -16 + 8,
          width: 28,
          height: 8,
          background: "linear-gradient(90deg, #8fb340, #c4dd58)",
          borderRadius: 4,
          transform: "rotate(-15deg)",
        }}
      >
        <span
          className="absolute"
          style={{
            left: -6,
            top: -4,
            width: 12,
            height: 16,
            background: "linear-gradient(135deg, #8fb340, #6a9430)",
            borderRadius: "2px 6px 6px 2px",
          }}
        />
      </div>
    </div>
  );
}

function WaterDrops({ listening }: { listening: boolean }) {
  // Match design: 5 drops with specific x-positions and staggered delays.
  const drops: Array<{ left: number; delay: string }> = [
    { left: 10, delay: "0s" },
    { left: 20, delay: "0.3s" },
    { left: 30, delay: "0.6s" },
    { left: 15, delay: "0.9s" },
    { left: 25, delay: "0.45s" },
  ];

  return (
    <div
      className="absolute"
      style={{
        top: 50,
        right: 20,
        width: 60,
        height: 80,
        opacity: listening ? 1 : 0,
        transition: "opacity 0.4s ease",
        // Above the SproutBody (zIndex 3) so drops stay visible at smaller
        // sizes (e.g. the K-hold modal at 240px), where the body fills more
        // of the character canvas. At full 280px the drops still read as
        // "falling onto the sprout" rather than passing behind it.
        zIndex: 5,
        pointerEvents: "none",
      }}
    >
      {drops.map((d, i) => (
        <span
          key={i}
          className="absolute"
          style={{
            left: d.left,
            width: 6,
            height: 10,
            background:
              "linear-gradient(180deg, var(--color-water-blue-light), var(--color-water-blue))",
            borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%",
            boxShadow: "0 0 4px rgba(109, 180, 212, 0.5)",
            animation: listening
              ? `water-fall 1.2s ease-in ${d.delay} infinite`
              : undefined,
          }}
        />
      ))}
    </div>
  );
}
