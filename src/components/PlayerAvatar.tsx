"use client";

import { memo, useId } from "react";
import { BotGlyph, LionCrest, PLAYERS, PlayerId, ShipPips } from "./PlayerBadge";

/**
 * Original fictional character portraits for each side, drawn in one shared
 * style: same bust framing, head geometry, and lighting — only palette,
 * uniform, and insignia differ so the two factions read as a matched pair.
 */

interface PortraitTheme {
  bgFrom: string;
  bgTo: string;
  skin: string;
  skinShade: string;
  hair: string;
  jacket: string;
  jacketDark: string;
}

const PORTRAITS: Record<PlayerId, PortraitTheme> = {
  dutch: {
    bgFrom: "#1d2f4f",
    bgTo: "#0a1628",
    skin: "#e9b689",
    skinShade: "#c98f63",
    hair: "#3d2c1e",
    jacket: "#152945",
    jacketDark: "#0d1830",
  },
  devin: {
    bgFrom: "#15293b",
    bgTo: "#0b1424",
    skin: "#d9a988",
    skinShade: "#b5815f",
    hair: "#141c28",
    jacket: "#1e293b",
    jacketDark: "#141d2c",
  },
};

/** Head-and-shoulders portrait, front-on, in a 96x96 box (clip to a circle). */
export function AvatarPortrait({ player }: { player: PlayerId }) {
  const t = PORTRAITS[player];
  const rawId = useId();
  const bgId = `abg-${rawId.replace(/[^a-zA-Z0-9-]/g, "")}`;
  return (
    <svg viewBox="0 0 96 96" className="h-full w-full" aria-hidden>
      <defs>
        <radialGradient id={bgId} cx="0.5" cy="0.34" r="0.85">
          <stop offset="0%" stopColor={t.bgFrom} />
          <stop offset="100%" stopColor={t.bgTo} />
        </radialGradient>
      </defs>
      <rect width="96" height="96" fill={`url(#${bgId})`} />

      {/* neck */}
      <path d="M41 50 H55 V63 Q48 67 41 63 Z" fill={t.skin} />
      <path d="M41 50 H55 V55 Q48 59 41 55 Z" fill={t.skinShade} />

      {/* jacket / shoulders */}
      <path
        d="M6 96 C7 78 18 68 33 64 L41 61.5 C42.5 68 45 71 48 71 C51 71 53.5 68 55 61.5 L63 64 C78 68 89 78 90 96 Z"
        fill={t.jacket}
      />
      {/* collar */}
      <path d="M41 61.5 L48 71 L38 74 Z" fill={t.jacketDark} />
      <path d="M55 61.5 L48 71 L58 74 Z" fill={t.jacketDark} />

      {player === "dutch" ? <DutchUniform /> : <DevinUniform />}

      {/* ears */}
      <ellipse cx="33.5" cy="38" rx="2.6" ry="4" fill={t.skin} />
      <ellipse cx="62.5" cy="38" rx="2.6" ry="4" fill={t.skin} />

      {/* head */}
      <path
        d="M48 15 C57.5 15 62.5 22.5 62.5 33 C62.5 43.5 56.5 53 48 53 C39.5 53 33.5 43.5 33.5 33 C33.5 22.5 38.5 15 48 15 Z"
        fill={t.skin}
      />

      {player === "dutch" ? (
        <>
          {/* brows, eyes, nose, confident mouth */}
          <path
            d="M39.5 33.5 L45 32.6 M56.5 33.5 L51 32.6"
            stroke={t.hair}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <ellipse cx="42.2" cy="36.6" rx="1.6" ry="2" fill="#26180f" />
          <ellipse cx="53.8" cy="36.6" rx="1.6" ry="2" fill="#26180f" />
          <path
            d="M48 37 L47.2 42.5 L49.4 42.8"
            stroke={t.skinShade}
            strokeWidth="1.4"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M44 47 Q48 49.4 52 47"
            stroke="#8a5a3a"
            strokeWidth="1.6"
            strokeLinecap="round"
            fill="none"
          />
          <DutchCap />
        </>
      ) : (
        <>
          <DevinHair />
          {/* brows above the visor */}
          <path
            d="M39.5 31.4 L45 30.8 M56.5 31.4 L51 30.8"
            stroke={t.hair}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          {/* AR visor across the eyes */}
          <rect
            x="35"
            y="33"
            width="26"
            height="6.5"
            rx="3.2"
            fill="#0b2a38"
            opacity="0.88"
          />
          <rect x="35" y="33" width="26" height="6.5" rx="3.2" fill="none" stroke="#00d9ff" strokeWidth="1" opacity="0.9" />
          <line
            x1="38"
            y1="36.2"
            x2="58"
            y2="36.2"
            stroke="#7deeff"
            strokeWidth="1"
            opacity="0.8"
          />
          <circle cx="42.2" cy="36.2" r="1.5" fill="#00d9ff" />
          <circle cx="53.8" cy="36.2" r="1.5" fill="#00d9ff" />
          {/* earpiece */}
          <rect x="60.6" y="35" width="4" height="7" rx="2" fill="#141d2c" />
          <circle cx="62.6" cy="38.5" r="1.2" fill="#00d9ff" />
          <path
            d="M48 37 L47.2 42.5 L49.4 42.8"
            stroke={t.skinShade}
            strokeWidth="1.4"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M44.5 47 Q48 48.8 51.5 47"
            stroke="#7c4a30"
            strokeWidth="1.6"
            strokeLinecap="round"
            fill="none"
          />
        </>
      )}
    </svg>
  );
}

/** Peaked officer's cap: navy crown, orange-piped band, lion cap badge. */
function DutchCap() {
  return (
    <g>
      {/* crown */}
      <path
        d="M31 26 C31 15 39 9.5 48 9.5 C57 9.5 65 15 65 26 L64 27 C58 24 38 24 32 27 Z"
        fill="#12233f"
      />
      <path
        d="M31 26 C31 15 39 9.5 48 9.5 C57 9.5 65 15 65 26"
        fill="none"
        stroke="#ff8c00"
        strokeWidth="1.2"
        opacity="0.9"
      />
      {/* band */}
      <path d="M32 26.5 C38 23.5 58 23.5 64 26.5 L64 30.5 C58 28 38 28 32 30.5 Z" fill="#0d1830" />
      {/* visor */}
      <path d="M35 29.5 C42 27.5 54 27.5 61 29.5 C58 32.6 38 32.6 35 29.5 Z" fill="#060d19" />
      {/* cap badge: gold wreath dot + lion */}
      <circle cx="48" cy="19" r="4.6" fill="#0a1628" stroke="#ff8c00" strokeWidth="1.2" />
      <svg x="44.4" y="15.4" width="7.2" height="7.2" viewBox="0 0 48 48">
        <LionCrest />
      </svg>
    </g>
  );
}

/** Short cropped hair for the AI operator. */
function DevinHair() {
  return (
    <path
      d="M33.5 33 C33 20 39 13.5 48 13.5 C57 13.5 63 20 62.5 33 C62.5 28 61 25.5 58.5 24.5 C53 22.5 43 22.5 37.5 24.5 C35 25.5 33.8 28 33.5 33 Z"
      fill="#141c28"
    />
  );
}

/** Dutch dress uniform: orange lapel piping, epaulettes, brass, crest patch. */
function DutchUniform() {
  return (
    <g>
      {/* lapel piping */}
      <path
        d="M41 61.5 L36 74 L40 96 M55 61.5 L60 74 L56 96"
        fill="none"
        stroke="#ff8c00"
        strokeWidth="1.6"
        opacity="0.95"
      />
      {/* epaulettes with rank stripes */}
      <g>
        <rect x="13" y="66.5" width="17" height="6.5" rx="2.4" fill="#0d1830" transform="rotate(-14 21 70)" />
        <path d="M17 70.8 L21 69.8 M21.5 69.7 L25.5 68.7" stroke="#ffb066" strokeWidth="1.6" transform="rotate(-14 21 70)" />
        <rect x="66" y="66.5" width="17" height="6.5" rx="2.4" fill="#0d1830" transform="rotate(14 75 70)" />
        <path d="M70 68.7 L74 69.7 M74.5 69.8 L78.5 70.8" stroke="#ffb066" strokeWidth="1.6" transform="rotate(14 75 70)" />
      </g>
      {/* brass buttons */}
      <circle cx="48" cy="78" r="1.7" fill="#fbbf24" />
      <circle cx="48" cy="86" r="1.7" fill="#fbbf24" />
      {/* chest crest patch */}
      <circle cx="31" cy="83" r="5.2" fill="#0a1628" stroke="#ff8c00" strokeWidth="1.1" />
      <svg x="27.2" y="79.2" width="7.6" height="7.6" viewBox="0 0 48 48">
        <LionCrest />
      </svg>
      {/* name tape */}
      <rect x="53" y="80" width="26" height="7" rx="1.5" fill="#0d1830" stroke="#ff8c00" strokeWidth="0.7" />
      <text
        x="66"
        y="85.2"
        textAnchor="middle"
        fontSize="4.4"
        fontWeight="700"
        letterSpacing="0.5"
        fill="#ffb066"
        fontFamily="var(--font-geist-mono), monospace"
      >
        DUTCH NAVY
      </text>
    </g>
  );
}

/** Devin ops jacket: glowing circuit piping, node patch, high-tech tape. */
function DevinUniform() {
  return (
    <g>
      {/* circuit piping traces */}
      <path
        d="M41 61.5 L37 74 L41 96 M55 61.5 L59 74 L55 96"
        fill="none"
        stroke="#00d9ff"
        strokeWidth="1.4"
        opacity="0.95"
      />
      <path
        d="M14 84 L24 84 L28 78 M82 84 L72 84 L68 78"
        fill="none"
        stroke="#00d9ff"
        strokeWidth="1.1"
        opacity="0.7"
      />
      <circle cx="14" cy="84" r="1.4" fill="#7deeff" />
      <circle cx="82" cy="84" r="1.4" fill="#7deeff" />
      {/* high collar seams */}
      <path d="M38 74 L48 71 L58 74" fill="none" stroke="#2c3d55" strokeWidth="1.4" />
      {/* chest node patch */}
      <rect x="25.5" y="77.5" width="11" height="11" rx="2.6" fill="#0b1424" stroke="#00d9ff" strokeWidth="1.1" />
      <svg x="27" y="79" width="8" height="8" viewBox="0 0 48 48">
        <BotGlyph />
      </svg>
      {/* name tape */}
      <rect x="53" y="80" width="26" height="7" rx="1.5" fill="#0b1424" stroke="#00d9ff" strokeWidth="0.7" />
      <text
        x="66"
        y="85.2"
        textAnchor="middle"
        fontSize="4.6"
        fontWeight="700"
        letterSpacing="0.9"
        fill="#7deeff"
        fontFamily="var(--font-geist-mono), monospace"
      >
        DEVIN AI
      </text>
    </g>
  );
}

const BADGE_SIZES = {
  sm: "h-8 w-8",
  md: "h-11 w-11",
  lg: "h-20 w-20",
  xl: "h-24 w-24 sm:h-28 sm:w-28",
  hero: "h-36 w-36 sm:h-44 sm:w-44",
} as const;

export interface PlayerAvatarBadgeProps {
  player: PlayerId;
  size?: keyof typeof BADGE_SIZES;
  /** Pulse the badge in the player's color (their turn). */
  active?: boolean;
}

/**
 * Character portrait in a circular frame: rope braid for the Dutch Navy,
 * circuit traces for Devin AI — same ring weight so the pair matches.
 */
export const PlayerAvatarBadge = memo(function PlayerAvatarBadge({
  player,
  size = "md",
  active,
}: PlayerAvatarBadgeProps) {
  const theme = PLAYERS[player];
  return (
    <span
      title={theme.name}
      className={`relative inline-block shrink-0 rounded-full transition-shadow duration-300 ${BADGE_SIZES[size]} ${
        active ? theme.pulseClass : ""
      }`}
    >
      <span
        className={`absolute inset-0 block ${active ? "animate-handoff-pop" : ""}`}
      >
        <span className="absolute inset-0 overflow-hidden rounded-full">
          <AvatarPortrait player={player} />
        </span>
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
        {player === "dutch" ? (
          <>
            <circle cx="50" cy="50" r="47" fill="none" stroke="#b45309" strokeWidth="5.5" />
            <circle
              cx="50"
              cy="50"
              r="47"
              fill="none"
              stroke="#ffb066"
              strokeWidth="5.5"
              strokeDasharray="3 4.4"
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            <circle cx="50" cy="50" r="47" fill="none" stroke="#0e7490" strokeWidth="5.5" />
            <circle
              cx="50"
              cy="50"
              r="47"
              fill="none"
              stroke="#00d9ff"
              strokeWidth="2"
              strokeDasharray="16 8"
            />
            {[45, 135, 225, 315].map((deg) => (
              <circle
                key={deg}
                cx={50 + 47 * Math.cos((deg * Math.PI) / 180)}
                cy={50 + 47 * Math.sin((deg * Math.PI) / 180)}
                r="2.6"
                fill="#7deeff"
              />
            ))}
          </>
        )}
        </svg>
      </span>
    </span>
  );
});

/** Callsigns shown on the team ID cards. */
export const CALLSIGNS: Record<PlayerId, string> = {
  dutch: "Adm. W. van Oranje",
  devin: "Op. D3V-1N",
};

export interface PlayerCharacterCardProps {
  player: PlayerId;
  /** Ships destroyed in this player's fleet. */
  sunkCount: number;
  /** Strong glow + scale-up when it is this player's turn. */
  active?: boolean;
  /** Scale back and fade while the other side holds the turn. */
  dimmed?: boolean;
  /** Turn-state label shown under the portrait. */
  status: string;
  /** Bump to fire a quick glow burst (this player just landed a hit). */
  hitFlashSeq?: number | null;
}

/** Large framed character card: portrait bust, name, callsign, fleet pips. */
export function PlayerCharacterCard({
  player,
  sunkCount,
  active,
  dimmed,
  status,
  hitFlashSeq,
}: PlayerCharacterCardProps) {
  const theme = PLAYERS[player];
  const dutch = player === "dutch";
  return (
    <div
      className={`relative flex w-[10.25rem] flex-col items-center rounded-2xl border-2 bg-navy-900/85 px-3 pb-2.5 pt-3 transition-all duration-500 ease-out will-change-transform sm:w-48 lg:w-56 ${
        active
          ? `scale-[1.07] ${
              dutch
                ? "animate-glow-pulse-dutch-strong border-dutch-500/80"
                : "animate-glow-pulse-devin-strong border-devin-400/80"
            }`
          : "border-navy-line"
      } ${dimmed ? "scale-[0.94] opacity-70 saturate-[0.75]" : ""}`}
    >
      {hitFlashSeq != null && (
        <span
          key={hitFlashSeq}
          aria-hidden
          className={`pointer-events-none absolute -inset-0.5 rounded-2xl ${
            dutch ? "card-hit-flash-dutch" : "card-hit-flash-devin"
          }`}
        />
      )}
      <div
        className={`h-20 w-20 overflow-hidden rounded-xl border-2 sm:h-24 sm:w-24 lg:h-36 lg:w-36 ${
          dutch ? "border-dutch-500/70" : "border-devin-400/70"
        }`}
      >
        <AvatarPortrait player={player} />
      </div>
      <p
        className={`mt-2 font-display text-sm font-extrabold leading-tight tracking-wide lg:text-lg ${theme.text}`}
      >
        {theme.name}
      </p>
      <p className="font-mono text-[9px] uppercase tracking-wider text-foam-400 lg:text-[10px]">
        {CALLSIGNS[player]}
      </p>
      <div className="mt-1">
        <ShipPips player={player} sunkCount={sunkCount} />
      </div>
      <p
        className={`mt-1.5 rounded-full border px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider transition-colors duration-300 lg:text-[10px] ${
          active
            ? dutch
              ? "border-dutch-500/50 text-dutch-400"
              : "border-devin-400/50 text-devin-400"
            : "border-navy-line text-foam-400"
        }`}
      >
        {status}
      </p>
    </div>
  );
}

export interface ScoreboardProps {
  /** Whose turn it is; null once the game is over. */
  activePlayer: PlayerId | null;
  /** Ships destroyed in the Dutch Navy (human) fleet. */
  dutchSunk: number;
  /** Ships destroyed in the Devin AI fleet. */
  devinSunk: number;
  /** Center status message. */
  message: string;
  /** Latest landed hit, to flash the attacker's card. */
  hitFlash?: { player: PlayerId; seq: number } | null;
}

function cardStatus(player: PlayerId, activePlayer: PlayerId | null): string {
  if (activePlayer === null) {
    return "Cease fire";
  }
  if (activePlayer !== player) {
    return "Standing by";
  }
  return player === "dutch" ? "Your turn" : "Devin AI is thinking…";
}

/**
 * HUD strip: both character cards flanking the status pill, each above its
 * own board — Devin left (over Devin AI waters), Dutch right (over the
 * Dutch Navy grid); on mobile the cards keep that order above the stack.
 */
export function Scoreboard({
  activePlayer,
  dutchSunk,
  devinSunk,
  message,
  hitFlash,
}: ScoreboardProps) {
  return (
    <div className="flex w-full max-w-4xl flex-wrap items-center justify-center gap-x-3 gap-y-2 sm:justify-between">
      <div className="animate-rise-in">
        <PlayerCharacterCard
          player="devin"
          sunkCount={devinSunk}
          active={activePlayer === "devin"}
          dimmed={activePlayer === "dutch"}
          status={cardStatus("devin", activePlayer)}
          hitFlashSeq={hitFlash?.player === "devin" ? hitFlash.seq : null}
        />
      </div>
      <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
        <p
          className={`mx-auto flex w-fit items-center gap-2 rounded-full border bg-navy-900/80 px-4 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wider transition-all duration-200 sm:text-xs ${
            activePlayer === null
              ? "border-navy-line text-foam-400"
              : activePlayer === "dutch"
                ? "animate-glow-pulse-dutch border-dutch-500/60 text-dutch-400"
                : "animate-glow-pulse-devin border-devin-400/60 text-devin-400"
          }`}
        >
          {message}
        </p>
      </div>
      <div className="animate-rise-in [animation-delay:120ms]">
        <PlayerCharacterCard
          player="dutch"
          sunkCount={dutchSunk}
          active={activePlayer === "dutch"}
          dimmed={activePlayer === "devin"}
          status={cardStatus("dutch", activePlayer)}
          hitFlashSeq={hitFlash?.player === "dutch" ? hitFlash.seq : null}
        />
      </div>
    </div>
  );
}
