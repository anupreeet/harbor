"use client";

import { Mic, MicOff, MonitorUp, PhoneOff, Video, VideoOff } from "lucide-react";
import { useLocalCamera } from "@/app/components/cvi/hooks/use-local-camera";
import { useLocalMicrophone } from "@/app/components/cvi/hooks/use-local-microphone";
import { useLocalScreenshare } from "@/app/components/cvi/hooks/use-local-screenshare";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Round call controls with a tooltip each; off-states are white so they read at a glance.
function Control({ label, onClick, disabled, tone = "neutral", children }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "neutral" | "off" | "active" | "danger";
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon-lg"
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
          className={cn(
            "size-12 rounded-full [&_svg:not([class*='size-'])]:size-5",
            tone === "neutral" && "bg-white/10 text-white hover:bg-white/20",
            tone === "off" && "bg-white text-black hover:bg-white/90",
            tone === "active" && "bg-primary text-primary-foreground hover:bg-primary/90",
            tone === "danger" && "w-16 bg-red-600 text-white hover:bg-red-500",
          )}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function MicControl() {
  const { isMicMuted, isMicReady, onToggleMicrophone } = useLocalMicrophone();
  return (
    <Control label={isMicMuted ? "Unmute" : "Mute"} onClick={onToggleMicrophone} disabled={!isMicReady} tone={isMicMuted ? "off" : "neutral"}>
      {isMicMuted ? <MicOff /> : <Mic />}
    </Control>
  );
}

export function CameraControl() {
  const { isCamMuted, isCamReady, onToggleCamera } = useLocalCamera();
  return (
    <Control label={isCamMuted ? "Turn camera on" : "Turn camera off"} onClick={onToggleCamera} disabled={!isCamReady} tone={isCamMuted ? "off" : "neutral"}>
      {isCamMuted ? <VideoOff /> : <Video />}
    </Control>
  );
}

// Raven sees whatever is shared, so this is how a caller shows Anna a prescription list.
export function ShareControl() {
  const { isScreenSharing, onToggleScreenshare } = useLocalScreenshare();
  return (
    <Control label={isScreenSharing ? "Stop sharing" : "Share your screen with Anna"} onClick={onToggleScreenshare} tone={isScreenSharing ? "active" : "neutral"}>
      <MonitorUp />
    </Control>
  );
}

export function EndControl({ onEnd }: { onEnd: () => void }) {
  return (
    <Control label="End call" onClick={onEnd} tone="danger">
      <PhoneOff />
    </Control>
  );
}
