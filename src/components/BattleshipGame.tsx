"use client";

import { useState } from "react";
import { Difficulty } from "@/game/ai";
import {
  RankInfo,
  ShipClassId,
  StoredCampaign,
  clearStoredCampaign,
  loadStoredCampaign,
  rankForLevel,
  storeCampaign,
} from "@/game/campaign";
import {
  GameApiError,
  RemoteGame,
  campaignRequest,
  startGame,
} from "@/game/client";
import { CampaignUpdate } from "@/game/protocol";
import { ShipPlacement } from "@/game/types";
import { AdmiralBattleScreen } from "./AdmiralBattleScreen";
import { BattleScreen, describeApiError } from "./BattleScreen";
import { ArmoryScreen } from "./ArmoryScreen";
import { BridgeHeader, CoordinateReadout } from "./BridgeHeader";
import { GameMode, PlacementScreen } from "./PlacementScreen";
import { PromotionModal } from "./PromotionModal";
import { AmbientParticles, SplashScreen } from "./SplashScreen";
import { useSoundManager } from "./useSoundManager";

export default function BattleshipGame() {
  const [deployed, setDeployed] = useState(false);
  const [round, setRound] = useState(0);

  if (!deployed) {
    return (
      <div className="relative flex min-h-screen w-full flex-1 flex-col">
        <WaveBackdrop />
        <AmbientParticles />
        <SplashScreen onDeploy={() => setDeployed(true)} />
        <CoordinateReadout />
      </div>
    );
  }

  return <GameRound key={round} onPlayAgain={() => setRound((r) => r + 1)} />;
}

/** Where the Battle Commander campaign currently is in its loop. */
type CampaignPhase =
  | { screen: "armory" }
  | { screen: "placement" }
  | { screen: "battle"; session: RemoteGame };

function GameRound({ onPlayAgain }: { onPlayAgain: () => void }) {
  const sound = useSoundManager();
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [mode, setMode] = useState<GameMode>("classic");
  const [session, setSession] = useState<RemoteGame | null>(null);
  const [campaign, setCampaign] = useState<StoredCampaign | null>(null);
  const [campaignPhase, setCampaignPhase] = useState<CampaignPhase>({
    screen: "armory",
  });
  const [promotion, setPromotion] = useState<RankInfo | null>(null);
  // The sealed save on this device, so the mode card can offer "Continue".
  // Only its token is authoritative; the server re-validates on every use.
  const [savedCampaign, setSavedCampaign] = useState<StoredCampaign | null>(
    () => loadStoredCampaign(),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Run one server call, surfacing failures as a notice. */
  const call = async (work: () => Promise<void>) => {
    if (pending) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setPending(false);
    }
  };

  const adoptCampaign = (next: StoredCampaign) => {
    storeCampaign(next);
    setSavedCampaign(next);
    setCampaign(next);
  };

  const openCampaign = () =>
    call(async () => {
      const token = savedCampaign?.token ?? null;
      setCampaignPhase({ screen: "armory" });
      try {
        adoptCampaign(await campaignRequest({ op: "load", token }));
      } catch (err) {
        // A save this server no longer accepts is discarded, never trusted.
        if (err instanceof GameApiError && err.code === "invalid-token") {
          clearStoredCampaign();
          adoptCampaign(await campaignRequest({ op: "load", token: null }));
          return;
        }
        throw err;
      }
    });

  const handleCampaignResult = (update: CampaignUpdate) => {
    adoptCampaign({ token: update.token, state: update.state });
    if (update.promotedTo) {
      setPromotion(update.promotedTo);
    }
  };

  const startBattle = (fleet: ShipPlacement[]) =>
    call(async () => {
      if (campaign) {
        const game = await startGame({
          mode: "campaign",
          difficulty: "hard",
          campaignToken: campaign.token,
          fleet,
        });
        setCampaignPhase({ screen: "battle", session: game });
        return;
      }
      setSession(await startGame({ mode, difficulty, fleet }));
    });

  const campaignView =
    campaign === null ? null : campaignPhase.screen === "armory" ? (
      <ArmoryScreen
        campaign={campaign.state}
        sound={sound}
        onUpgrade={(shipClass: ShipClassId) =>
          void call(async () =>
            adoptCampaign(
              await campaignRequest({
                op: "upgrade",
                token: campaign.token,
                ship: shipClass,
              }),
            ),
          )
        }
        onStartLevel={() => setCampaignPhase({ screen: "placement" })}
        onExit={() => setCampaign(null)}
        onReset={() =>
          void call(async () =>
            adoptCampaign(await campaignRequest({ op: "reset" })),
          )
        }
      />
    ) : campaignPhase.screen === "placement" ? (
      <PlacementScreen
        sound={sound}
        difficulty={difficulty}
        onDifficultyChange={setDifficulty}
        mode="classic"
        onModeChange={() => {}}
        campaign={{
          level: campaign.state.level,
          rankTitle: rankForLevel(campaign.state.level).title,
        }}
        onStart={(fleet) => void startBattle(fleet)}
      />
    ) : (
      <AdmiralBattleScreen
        session={campaignPhase.session}
        difficulty="hard"
        sound={sound}
        onPlayAgain={() => setCampaignPhase({ screen: "armory" })}
        playAgainLabel="Return to Fleet Command"
        campaign={{
          level: campaign.state.level,
          upgrades: campaign.state.upgrades,
          onResult: handleCampaignResult,
        }}
      />
    );

  return (
    <div className="relative flex min-h-screen w-full flex-1 flex-col">
      <WaveBackdrop />
      <AmbientParticles />

      <BridgeHeader>
        <button
          type="button"
          onClick={() => {
            sound.toggle();
            if (!sound.enabled) {
              sound.play("click");
            }
          }}
          aria-pressed={sound.enabled}
          aria-label={`Sound ${sound.enabled ? "on" : "off"}`}
          title={`Sound ${sound.enabled ? "on" : "off"}`}
          className={`flex h-10 w-10 items-center justify-center rounded-xl border shadow-btn transition-all duration-200 ease-out active:scale-95 ${
            sound.enabled
              ? "border-cyan-cta/50 bg-navy-800 text-cyan-cta hover:shadow-glow-cyan"
              : "border-navy-line bg-navy-900 text-foam-400 hover:text-foam-300"
          }`}
        >
          <SoundIcon on={sound.enabled} />
        </button>
      </BridgeHeader>

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
        {(error || pending) && (
          <p
            role={error ? "alert" : "status"}
            className={`radar-panel mx-auto w-full max-w-xl rounded-2xl border px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider shadow-panel ${
              error
                ? "border-coral-500/50 bg-navy-900/90 text-coral-200"
                : "border-navy-line/70 bg-navy-900/85 text-foam-400"
            }`}
          >
            {error ?? "Contacting fleet command…"}
          </p>
        )}
        {campaignView ? (
          <>
            {campaignView}
            {promotion && campaign && (
              <PromotionModal
                rank={promotion}
                level={campaign.state.level}
                sound={sound}
                onContinue={() => {
                  setPromotion(null);
                  setCampaignPhase({ screen: "armory" });
                }}
              />
            )}
          </>
        ) : session ? (
          session.mode === "admiral" ? (
            <AdmiralBattleScreen
              session={session}
              difficulty={difficulty}
              sound={sound}
              onPlayAgain={onPlayAgain}
            />
          ) : (
            <BattleScreen
              session={session}
              difficulty={difficulty}
              sound={sound}
              onPlayAgain={onPlayAgain}
            />
          )
        ) : (
          <PlacementScreen
            sound={sound}
            difficulty={difficulty}
            onDifficultyChange={setDifficulty}
            mode={mode}
            onModeChange={setMode}
            onStart={(fleet) => void startBattle(fleet)}
            battleCommander={{
              level: savedCampaign?.state.level ?? 1,
              hasSave:
                savedCampaign !== null &&
                (savedCampaign.state.level > 1 ||
                  Object.keys(savedCampaign.state.records).length > 0),
              onLaunch: () => void openCampaign(),
            }}
          />
        )}
      </div>

      <CoordinateReadout />
    </div>
  );
}

/** Slow-drifting wave lines behind the boards. */
function WaveBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 bottom-0 z-0 h-64 overflow-hidden opacity-[0.14]"
    >
      <svg
        viewBox="0 0 1200 200"
        preserveAspectRatio="none"
        className="animate-waves-drift h-full w-[200%]"
      >
        <path
          d="M0 120 Q75 90 150 120 T300 120 T450 120 T600 120 T750 120 T900 120 T1050 120 T1200 120 V200 H0 Z"
          fill="#22d3ee"
        />
        <path
          d="M0 155 Q100 130 200 155 T400 155 T600 155 T800 155 T1000 155 T1200 155 V200 H0 Z"
          fill="#0ea5e9"
        />
      </svg>
    </div>
  );
}

function SoundIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path
        d="M4 9 H8 L13 5 V19 L8 15 H4 Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {on ? (
        <>
          <path
            d="M16 9 Q18 12 16 15"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M18.5 7 Q21.5 12 18.5 17"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </>
      ) : (
        <path
          d="M16 9.5 L21 14.5 M21 9.5 L16 14.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
