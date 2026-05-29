export function FloatingKbd() {
  return (
    <div
      className="fixed z-30 flex items-center gap-2.5 rounded-full border px-4 py-2.5 text-[13px] max-[700px]:bottom-4 max-[700px]:right-4 max-[700px]:px-3 max-[700px]:py-2 max-[700px]:text-xs"
      style={{
        bottom: 32,
        right: 32,
        background: "var(--color-card)",
        borderColor: "var(--color-rule)",
        color: "var(--color-ink-soft)",
        boxShadow: "var(--shadow-md)",
        animation: "floating-rise 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) 0.5s backwards",
      }}
    >
      <span className="font-medium">Hold</span>
      <span className="kbd-key">K</span>
      <span className="font-medium">
        anywhere to talk to{" "}
        <strong style={{ color: "var(--color-forest)", fontWeight: 700 }}>Sprouty</strong>
      </span>
    </div>
  );
}
