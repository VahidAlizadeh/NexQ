import { useState, useCallback } from "react";
import { useConfigStore } from "../../stores/configStore";
import { useMeetingStore } from "../../stores/meetingStore";
import { WelcomeStep } from "./WelcomeStep";
import { AudioSetupStep } from "./AudioSetupStep";
import { STTSetupStep } from "./STTSetupStep";
import { LLMSetupStep } from "./LLMSetupStep";
import { ReadyStep } from "./ReadyStep";
import { ChevronLeft, ChevronRight, SkipForward } from "lucide-react";

const STEP_COUNT = 5;
const STEP_LABELS = ["Welcome", "Audio", "STT", "LLM", "Ready"];

interface DetectionData {
  ollamaRunning: boolean;
  ollamaModels: string[];
  lmStudioRunning: boolean;
  lmStudioModels: string[];
}

export function FirstRunWizard() {
  const setFirstRunCompleted = useConfigStore((s) => s.setFirstRunCompleted);
  const startMeetingFlow = useMeetingStore((s) => s.startMeetingFlow);
  const setSettingsOpen = useMeetingStore((s) => s.setSettingsOpen);

  const [currentStep, setCurrentStep] = useState(0);
  const [detectionComplete, setDetectionComplete] = useState(false);
  const [slideDirection, setSlideDirection] = useState<"left" | "right">("right");
  const [isAnimating, setIsAnimating] = useState(false);

  // Store detection results to pass to LLM step
  const [detection, setDetection] = useState<DetectionData>({
    ollamaRunning: false,
    ollamaModels: [],
    lmStudioRunning: false,
    lmStudioModels: [],
  });

  const animateToStep = useCallback(
    (nextStep: number) => {
      if (isAnimating) return;
      setSlideDirection(nextStep > currentStep ? "right" : "left");
      setIsAnimating(true);
      // Small delay so the CSS transition class triggers
      requestAnimationFrame(() => {
        setCurrentStep(nextStep);
        setTimeout(() => setIsAnimating(false), 300);
      });
    },
    [currentStep, isAnimating]
  );

  const handleNext = useCallback(() => {
    if (currentStep < STEP_COUNT - 1) {
      animateToStep(currentStep + 1);
    }
  }, [currentStep, animateToStep]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      animateToStep(currentStep - 1);
    }
  }, [currentStep, animateToStep]);

  const handleSkip = useCallback(() => {
    // Skip to the final step
    animateToStep(STEP_COUNT - 1);
  }, [animateToStep]);

  const handleDetectionComplete = useCallback(
    (result: {
      audioDevices: unknown;
      ollamaRunning: boolean;
      ollamaModels: string[];
      lmStudioRunning: boolean;
      lmStudioModels: string[];
    }) => {
      setDetection({
        ollamaRunning: result.ollamaRunning,
        ollamaModels: result.ollamaModels,
        lmStudioRunning: result.lmStudioRunning,
        lmStudioModels: result.lmStudioModels,
      });
      setDetectionComplete(true);
    },
    []
  );

  const handleStartMeeting = useCallback(async () => {
    setFirstRunCompleted(true);
    try {
      await startMeetingFlow();
    } catch (err) {
      console.error("[FirstRunWizard] Failed to start meeting:", err);
    }
  }, [setFirstRunCompleted, startMeetingFlow]);

  const handleGoToLauncher = useCallback(() => {
    setFirstRunCompleted(true);
  }, [setFirstRunCompleted]);

  const handleOpenContext = useCallback(() => {
    // Complete the wizard and open settings where the context panel is accessible
    setFirstRunCompleted(true);
    // Small delay so the launcher renders, then open settings
    setTimeout(() => {
      setSettingsOpen(true);
    }, 100);
  }, [setFirstRunCompleted, setSettingsOpen]);

  // Can proceed from step 0 only after detection is complete
  const canNext =
    currentStep === 0 ? detectionComplete : currentStep < STEP_COUNT - 1;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header with progress */}
      <header className="flex items-center justify-between border-b border-border/20 px-8 py-4">
        <div className="flex items-center gap-2.5">
          <span className="text-base font-bold tracking-tight text-foreground">
            NexQ
          </span>
          <span className="text-sm text-muted-foreground/60 font-medium">
            Setup
          </span>
        </div>

        {/* Step indicator dots */}
        <div className="flex items-center gap-2">
          {Array.from({ length: STEP_COUNT }).map((_, i) => (
            <button
              key={i}
              onClick={() => {
                // Only allow clicking completed steps or the current step
                if (i <= currentStep || (i === currentStep + 1 && canNext)) {
                  animateToStep(i);
                }
              }}
              className="group flex items-center gap-1"
              title={STEP_LABELS[i]}
            >
              <div
                className={`transition-all duration-300 rounded-full ${
                  i === currentStep
                    ? "h-2.5 w-8 bg-primary shadow-sm shadow-primary/30"
                    : i < currentStep
                      ? "h-2.5 w-2.5 bg-primary/50"
                      : "h-2.5 w-2.5 bg-border/40"
                }`}
              />
            </button>
          ))}
        </div>

        {/* Step label */}
        <span className="text-xs font-medium text-muted-foreground/70">
          Step {currentStep + 1} of {STEP_COUNT}
        </span>
      </header>

      {/* Step content area */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-8 py-10">
          <div
            className={`transition-all duration-300 ease-out ${
              isAnimating
                ? slideDirection === "right"
                  ? "translate-x-4 opacity-0"
                  : "-translate-x-4 opacity-0"
                : "translate-x-0 opacity-100"
            }`}
          >
            {currentStep === 0 && (
              <WelcomeStep onDetectionComplete={handleDetectionComplete} />
            )}
            {currentStep === 1 && <AudioSetupStep />}
            {currentStep === 2 && <STTSetupStep />}
            {currentStep === 3 && (
              <LLMSetupStep
                ollamaRunning={detection.ollamaRunning}
                ollamaModels={detection.ollamaModels}
                lmStudioRunning={detection.lmStudioRunning}
                lmStudioModels={detection.lmStudioModels}
              />
            )}
            {currentStep === 4 && (
              <ReadyStep
                onStartMeeting={handleStartMeeting}
                onGoToLauncher={handleGoToLauncher}
                onOpenContext={handleOpenContext}
              />
            )}
          </div>
        </div>
      </div>

      {/* Footer navigation */}
      <footer className="flex items-center justify-between border-t border-border/20 px-8 py-4">
        <div>
          {currentStep > 0 && currentStep < STEP_COUNT - 1 && (
            <button
              onClick={handleBack}
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Skip button — available on steps 1-2 */}
          {currentStep > 0 && currentStep < STEP_COUNT - 1 && (
            <button
              onClick={handleSkip}
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <SkipForward className="h-3.5 w-3.5" />
              Skip
            </button>
          )}

          {/* Next button — not shown on last step (it has its own actions) */}
          {currentStep < STEP_COUNT - 1 && (
            <button
              onClick={handleNext}
              disabled={!canNext}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
