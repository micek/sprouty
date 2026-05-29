import { AppFooter } from "@/components/app-footer";
import { FloatingKbd } from "@/components/floating-kbd";
import { KeyboardListener } from "@/components/keyboard-listener";
import { KnowledgeBase } from "@/components/knowledge-base";
import { ListeningModal } from "@/components/listening-modal";
import { PhotoVision } from "@/components/photo-vision";
import { PlanCard } from "@/components/plan-card";
import { PlanTimeline } from "@/components/plan-timeline";
import { PoweredBy } from "@/components/powered-by";
import { SettingsKeys } from "@/components/settings-keys";
import { ToastHost } from "@/components/toast-host";
import { TopBar } from "@/components/top-bar";
import { VoiceCard } from "@/components/voice-card";
import { VoiceSessionController } from "@/components/voice-session-controller";

export default function HomePage() {
  return (
    <>
      {/* Everything that should blur when the K-hold modal opens */}
      <div className="behind-modal">
        <TopBar />
        <main className="mx-auto max-w-[1280px] px-8 py-8 max-[700px]:px-5 max-[700px]:py-5">
          {/* HERO: Voice + Plan */}
          <div
            id="hero"
            className="scroll-anchor mb-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.65fr_1fr]"
          >
            <VoiceCard />
            <PlanCard />
          </div>

          <div id="knowledge" className="scroll-anchor">
            <KnowledgeBase />
          </div>
          <div id="plan" className="scroll-anchor">
            <PlanTimeline />
          </div>
          <div id="vision" className="scroll-anchor">
            <PhotoVision />
          </div>
          <PoweredBy />
          <SettingsKeys />
        </main>
        <AppFooter />
        <FloatingKbd />
      </div>

      {/* Above-the-blur layers */}
      <KeyboardListener />
      <ListeningModal />
      <VoiceSessionController />
      <ToastHost />
    </>
  );
}
