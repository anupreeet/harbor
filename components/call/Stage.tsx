"use client";

import { DailyAudioTrack, DailyVideo, useLocalSessionId, useVideoTrack } from "@daily-co/daily-react";
import { Loader2 } from "lucide-react";
import { useLocalScreenshare } from "@/app/components/cvi/hooks/use-local-screenshare";
import { useReplicaIDs } from "@/app/components/cvi/hooks/use-replica-ids";
import { cn } from "@/lib/utils";
import { CameraControl, EndControl, MicControl, ShareControl } from "./controls";

// The stage works like a video meeting with screen sharing. Normally Anna fills it. When she
// shows something (the canvas), or the caller shares their screen, that takes the stage and
// Anna moves to a thumbnail, the way a presenter does.
export function Stage({ canvas, speaking, onEnd }: { canvas: React.ReactNode | null; speaking: "pal" | "user" | null; onEnd: () => void }) {
  const replicaId = useReplicaIDs()[0];
  const localId = useLocalSessionId();
  const { isScreenSharing } = useLocalScreenshare();
  const replicaVideo = useVideoTrack(replicaId ?? "");
  const connected = !!replicaId && replicaVideo.state === "playable";
  const presenting = !!canvas || isScreenSharing;

  const anna = connected ? (
    <DailyVideo sessionId={replicaId} type="video" fit="cover" className="size-full" />
  ) : (
    <div className="grid size-full place-items-center text-sm text-white/70">
      <span className="flex items-center gap-2">
        <Loader2 className="size-4 animate-spin" /> Connecting you to Anna
      </span>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl bg-stage p-2">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg">
        {canvas ? (
          <div className="absolute inset-0 animate-in overflow-hidden rounded-lg bg-background duration-300 fade-in slide-in-from-right-8">{canvas}</div>
        ) : isScreenSharing ? (
          <DailyVideo sessionId={localId} type="screenVideo" fit="contain" className="size-full bg-black" />
        ) : (
          <div className="size-full bg-black">{anna}</div>
        )}
        {replicaId ? <DailyAudioTrack sessionId={replicaId} /> : null}

        {/* Anna's thumbnail while something else is on stage. */}
        {presenting ? (
          <div className="absolute right-3 bottom-3 z-10 aspect-video w-48 animate-in overflow-hidden rounded-lg bg-black shadow-xl ring-1 ring-black/20 duration-300 zoom-in-95 sm:w-60">
            {anna}
            <Speaking speaking={speaking === "pal"} label="Anna" className="bottom-2 left-2" />
          </div>
        ) : (
          <>
            <Speaking speaking={speaking === "pal"} label="Anna · AI assistant" className="top-3 left-3" />
            <SelfView sessionId={localId} />
          </>
        )}
      </div>

      <div className="flex items-center justify-center gap-3 pt-2">
        <MicControl />
        <CameraControl />
        <ShareControl />
        <EndControl onEnd={onEnd} />
      </div>
    </div>
  );
}

// A name tag with a speaking dot. Position comes from the caller (top-left on the stage,
// bottom-left on a thumbnail); setting both top and bottom would stretch it full height.
function Speaking({ speaking, label, className }: { speaking: boolean; label: string; className: string }) {
  return (
    <span className={cn("absolute flex h-6 items-center gap-1.5 rounded-md bg-black/60 px-2 text-xs text-white backdrop-blur", className)}>
      <span className={cn("size-1.5 rounded-full", speaking ? "animate-pulse bg-emerald-400" : "bg-white/40")} aria-hidden />
      {label}
    </span>
  );
}

function SelfView({ sessionId }: { sessionId: string }) {
  const video = useVideoTrack(sessionId);
  return (
    <div className="absolute right-3 bottom-3 aspect-video w-40 overflow-hidden rounded-lg bg-neutral-900 ring-1 ring-white/10 sm:w-52">
      {video.isOff ? (
        <span className="grid size-full place-items-center text-xs text-white/60">Camera off</span>
      ) : (
        <DailyVideo sessionId={sessionId} type="video" mirror fit="cover" className="size-full" />
      )}
      <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 text-[11px] text-white">You</span>
    </div>
  );
}
