import type { CSSProperties } from "react";

interface Fleck {
  left: string;
  top: string;
  size: string;
  duration: string;
  delay: string;
}

const FLECKS: Fleck[] = [
  { left: "12%", top: "18%", size: "3px", duration: "7s", delay: "0s" },
  { left: "34%", top: "62%", size: "2px", duration: "9s", delay: "1.4s" },
  { left: "58%", top: "28%", size: "3px", duration: "8s", delay: "3.1s" },
  { left: "76%", top: "71%", size: "2px", duration: "10s", delay: "0.8s" },
  { left: "22%", top: "84%", size: "2px", duration: "8.5s", delay: "4.6s" },
  { left: "88%", top: "12%", size: "3px", duration: "7.5s", delay: "2.2s" },
  { left: "47%", top: "46%", size: "2px", duration: "9.5s", delay: "5.3s" },
  { left: "66%", top: "88%", size: "3px", duration: "8s", delay: "6.1s" },
  { left: "8%", top: "52%", size: "2px", duration: "10s", delay: "3.8s" },
  { left: "82%", top: "42%", size: "2px", duration: "9s", delay: "1.9s" },
];

/**
 * Living-ocean overlay for a board panel: drifting caustic light patches,
 * slowly-moving wave-line texture, and sparse foam flecks fading in and out.
 * Purely decorative — sits above the water tiles but never blocks input.
 */
export function OceanLayer({ enemy }: { enemy?: boolean }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none relative z-20 col-start-2 row-start-2 overflow-hidden rounded-lg ${
        enemy ? "opacity-55" : "opacity-90"
      }`}
    >
      {enemy && <div className="absolute inset-0 bg-navy-950/25" />}
      <div className="ocean-caustic ocean-caustic-a" />
      <div className="ocean-caustic ocean-caustic-b" />
      <WaveLines />
      {FLECKS.map((f, i) => (
        <span
          key={i}
          className="animate-foam-fleck absolute rounded-full bg-foam-100"
          style={
            {
              left: f.left,
              top: f.top,
              width: f.size,
              height: f.size,
              "--fleck-t": f.duration,
              "--fleck-d": f.delay,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** Thin curved wave lines drifting horizontally, two layers at different speeds. */
function WaveLines() {
  return (
    <>
      <svg
        viewBox="0 0 400 300"
        preserveAspectRatio="none"
        className="animate-current-drift absolute inset-y-0 left-0 h-full w-[200%] opacity-[0.10]"
      >
        <g fill="none" stroke="#a5f3fc" strokeWidth="0.7">
          <path d="M0 40 Q25 34 50 40 T100 40 T150 40 T200 40 T250 40 T300 40 T350 40 T400 40" />
          <path d="M0 110 Q30 103 60 110 T120 110 T180 110 T240 110 T300 110 T360 110 T400 110" />
          <path d="M0 185 Q25 179 50 185 T100 185 T150 185 T200 185 T250 185 T300 185 T350 185 T400 185" />
          <path d="M0 255 Q30 248 60 255 T120 255 T180 255 T240 255 T300 255 T360 255 T400 255" />
        </g>
      </svg>
      <svg
        viewBox="0 0 400 300"
        preserveAspectRatio="none"
        className="animate-current-drift-slow absolute inset-y-0 left-0 h-full w-[200%] opacity-[0.07]"
      >
        <g fill="none" stroke="#e0f2fe" strokeWidth="0.6">
          <path d="M0 75 Q25 69 50 75 T100 75 T150 75 T200 75 T250 75 T300 75 T350 75 T400 75" />
          <path d="M0 150 Q30 144 60 150 T120 150 T180 150 T240 150 T300 150 T360 150 T400 150" />
          <path d="M0 225 Q25 219 50 225 T100 225 T150 225 T200 225 T250 225 T300 225 T350 225 T400 225" />
        </g>
      </svg>
    </>
  );
}
