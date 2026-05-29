import type { ReactNode } from "react";

interface SectionProps {
  eyebrow: string;
  title: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
}

/**
 * Shared section shell — the eyebrow label + headline + optional right-slot
 * header used by the Knowledge, Plan, and Vision blocks so they share one
 * consistent layout. `id` is the scroll anchor the TopBar tabs target.
 */
export function Section({ eyebrow, title, right, children, id, className }: SectionProps) {
  return (
    <section
      id={id}
      className={[
        "mb-6 rounded-[32px] border p-10 max-[700px]:p-6",
        className ?? "",
      ].join(" ")}
      style={{
        background: "var(--color-card)",
        borderColor: "var(--color-rule)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div
            className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: "var(--color-sage)" }}
          >
            <span
              className="inline-block"
              style={{
                width: 16,
                height: 1.5,
                background: "var(--color-sage)",
              }}
            />
            {eyebrow}
          </div>
          <h2
            className="font-tight text-[clamp(28px,3.4vw,36px)] font-bold leading-[1.05]"
            style={{
              color: "var(--color-forest)",
              letterSpacing: "-0.03em",
            }}
          >
            {title}
          </h2>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}
