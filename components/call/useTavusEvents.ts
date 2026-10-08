"use client";

import { useAppMessage, useDailyEvent } from "@daily-co/daily-react";
import { useCallback, useRef } from "react";
import type { CallAction } from "@/lib/call/session";
import { parseArgs, runToolViaServer, TOOL_DELIVERY } from "@/lib/call/relay";

// The bridge between Tavus and the screen. Tavus speaks the "Interactions Protocol" over the
// Daily room's data channel: utterances, who's speaking, and tool calls. Client tools are run
// through our API and answered with `conversation.tool_result`; server tools only get a
// "working on it" row here, because Tavus calls our server for those directly.

type TavusEvent = {
  event_type?: string;
  conversation_id?: string;
  inference_id?: string;
  seq?: number;
  properties?: { role?: string; speech?: string; name?: string; arguments?: unknown; tool_call_id?: string };
};

// `onAnnaDone` fires each time Anna finishes speaking (the test-script runner waits for it).
// `onCompliance` gets Tavus's guardrail and objective events. Tavus documents that they arrive on
// this channel but not their exact name, so anything mentioning guardrail/objective counts.
export const isComplianceEvent = (eventType: string) => /guardrail|objective/i.test(eventType);

export function useTavusEvents(
  conversationId: string,
  dispatch: (a: CallAction) => void,
  onAnnaDone?: () => void,
  onCompliance?: (eventType: string, properties: Record<string, unknown>) => void,
) {
  const sendAppMessage = useAppMessage();
  const seenToolCalls = useRef(new Set<string>());

  const handleToolCall = useCallback(
    async (e: TavusEvent) => {
      const { name, arguments: rawArgs, tool_call_id: toolCallId } = e.properties ?? {};
      // The browser can see the same event twice; each tool call runs once.
      if (!name || !toolCallId || seenToolCalls.current.has(toolCallId)) return;
      seenToolCalls.current.add(toolCallId);
      dispatch({ type: "tool_started", toolCallId, name, args: parseArgs(rawArgs) });
      if (TOOL_DELIVERY[name] !== "client") return;

      const started = performance.now();
      const out = await runToolViaServer(conversationId, toolCallId, name, rawArgs);
      console.debug("[tavus] tool_result sent", { name, toolCallId, status: out.status, ms: Math.round(performance.now() - started), output: out.result.speak });
      sendAppMessage(
        {
          message_type: "conversation",
          event_type: "conversation.tool_result",
          conversation_id: conversationId,
          // Same shape as Tavus's own CLI: output as a JSON string, with the tool's name.
          properties: { tool_call_id: toolCallId, name, output: JSON.stringify(out.result.speak), status: out.status },
        },
        "*",
      );
      dispatch({
        type: "tool_finished",
        toolCallId,
        name,
        card: out.result.card,
        ms: Math.round(performance.now() - started),
        failed: out.status === "error",
      });
    },
    [conversationId, sendAppMessage, dispatch],
  );

  useDailyEvent(
    "app-message",
    useCallback(
      (ev: { data?: TavusEvent }) => {
        const m = ev?.data;
        if (!m?.event_type || (m.conversation_id && m.conversation_id !== conversationId)) return;
        // Browser-side trace of everything Tavus sends: open the console and filter on [tavus].
        if (m.event_type !== "conversation.utterance.streaming") console.debug("[tavus]", m.event_type, m.properties ?? {});
        if (isComplianceEvent(m.event_type)) onCompliance?.(m.event_type, (m.properties ?? {}) as Record<string, unknown>);
        const role = m.properties?.role;
        switch (m.event_type) {
          case "conversation.utterance":
            // PAL turns arrive twice (role "pal" and legacy "replica"); keep one.
            if (role === "pal" || role === "user") {
              dispatch({ type: "line", id: `${m.inference_id ?? m.seq}-${role}`, role, text: m.properties?.speech ?? "" });
            }
            break;
          case "conversation.started_speaking":
            dispatch({ type: "speaking", role: role === "user" ? "user" : "pal" });
            break;
          case "conversation.stopped_speaking":
            dispatch({ type: "speaking", role: null });
            if (role !== "user") onAnnaDone?.();
            break;
          case "conversation.tool_call":
            void handleToolCall(m);
            break;
        }
      },
      [conversationId, handleToolCall, dispatch, onAnnaDone, onCompliance],
    ),
  );

  // Typed messages (and tapped appointment times) reach Anna as if the caller had said them.
  const typedCount = useRef(0);
  return useCallback(
    (text: string) => {
      sendAppMessage({ message_type: "conversation", event_type: "conversation.respond", conversation_id: conversationId, properties: { text } }, "*");
      dispatch({ type: "line", id: `typed-${++typedCount.current}`, role: "user", text, typed: true });
    },
    [conversationId, sendAppMessage, dispatch],
  );
}
