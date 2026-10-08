"use client";

import { DailyVideo, useLocalSessionId } from "@daily-co/daily-react";
import { Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useLocalCamera } from "@/app/components/cvi/hooks/use-local-camera";
import { useStartHaircheck } from "@/app/components/cvi/hooks/use-start-haircheck";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CameraControl, MicControl } from "./controls";

// The camera check happens before the Tavus conversation exists, because Tavus bills from
// the moment a conversation is created. Join is what creates it.
export function PreJoin({ topic, joining, error, onJoin }: { topic: string | null; joining: boolean; error: string | null; onJoin: () => void }) {
  const { requestPermissions, isPermissionsDenied } = useStartHaircheck();
  const { isCamMuted, isCamReady } = useLocalCamera();
  const localId = useLocalSessionId();
  useEffect(() => requestPermissions(), [requestPermissions]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:py-16">
        <div className="relative aspect-video overflow-hidden rounded-2xl bg-stage">
          {isCamReady && !isCamMuted ? (
            <DailyVideo sessionId={localId} type="video" mirror fit="cover" className="size-full" />
          ) : (
            <p className="grid size-full place-items-center px-6 text-center text-sm text-white/70">
              {isPermissionsDenied
                ? "Your browser is blocking the camera and microphone. Allow them in the address bar, then reload."
                : isCamMuted && isCamReady
                  ? "Your camera is off"
                  : "Starting your camera"}
            </p>
          )}
          <div className="absolute inset-x-0 bottom-0 flex justify-center gap-3 bg-gradient-to-t from-black/60 to-transparent pt-12 pb-4">
            <MicControl />
            <CameraControl />
          </div>
        </div>

        <div>
          <Badge variant="secondary">Camera check</Badge>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">Ready to talk with Anna?</h2>
          {topic ? <p className="mt-1 text-muted-foreground">You&apos;ll start with &ldquo;{topic}&rdquo;</p> : null}
          <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
            {[
              "She checks your doctors and prescriptions against official records as you talk.",
              "Results open on screen beside her, and you can tap to answer.",
              "Have your medication list handy, or share it on screen.",
              "Up to four and a half minutes, transcribed. Anna is an AI assistant.",
            ].map((t) => (
              <li key={t} className="flex gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                {t}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex items-center gap-2">
            <Button size="lg" className="h-11 px-6" onClick={onJoin} disabled={joining}>
              {joining ? <Loader2 className="animate-spin" /> : null}
              {joining ? "Connecting you to Anna" : "Join call"}
            </Button>
            <Button size="lg" variant="ghost" className="h-11" asChild>
              <Link href="/app">Cancel</Link>
            </Button>
          </div>
          {error ? (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </div>
    </div>
  );
}
