"use client";

import dynamic from "next/dynamic";

// Daily (WebRTC) only exists in the browser, so the call room never renders on the server.
export const CallRoomClient = dynamic(() => import("./CallRoom").then((m) => m.CallRoom), {
  ssr: false,
  loading: () => <p className="p-8 text-ink-3">Getting your camera ready</p>,
});
