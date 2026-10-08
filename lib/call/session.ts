// Client-side state for a live call, fed by the Tavus events on the video room's data
// channel. The call screen only ever renders this state, so it's unit-tested on its own.

import type { Card } from "../tools/cards";

export type { Card };
export type Speaker = "pal" | "user";
export type Line = { id: string; role: Speaker; text: string; at: number; typed?: boolean };
export type FileItem = Card & { key: string; tool: string; at: number };
// One row in the conversation for each thing Anna did: "Checking…", then what she found.
// `itemKey` points at the file item it produced, so the row can open it in the canvas.
export type Activity = {
  id: string;
  name: string;
  label: string;
  args: Record<string, unknown>;
  done: boolean;
  failed?: boolean;
  summary?: string;
  ms?: number;
  itemKey?: string;
  at: number;
};

export type CallState = {
  lines: Line[];
  items: FileItem[];
  activity: Activity[];
  speaking: Speaker | null;
  ended: boolean;
};

export type CallAction =
  | { type: "line"; id: string; role: Speaker; text: string; typed?: boolean }
  | { type: "speaking"; role: Speaker | null }
  | { type: "tool_started"; toolCallId: string; name: string; args: Record<string, unknown> }
  | { type: "tool_finished"; toolCallId?: string; name: string; card?: Card; ms?: number; failed?: boolean }
  | { type: "flag"; id: string; label: string }
  | { type: "ended" };

export const initialCallState: CallState = { lines: [], items: [], activity: [], speaking: null, ended: false };

// One file entry per real-world thing: a second lookup for the same drug updates it
// rather than stacking a duplicate.
export function keyFor(card: Card): string {
  switch (card.kind) {
    case "doctor": return `doctor:${card.data.npi}`;
    case "drug": return `drug:${card.data.name.toLowerCase()}`;
    case "cost": return `cost:${card.data.plan}`;
    case "preference": return `preference:${card.data.preference}`;
    case "plan_details": return `plan:${card.data.name}`;
    default: return card.kind; // plans, availability, booking, doctor_options: latest wins
  }
}

export function pendingLabel(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "lookup_doctor": return `Looking up ${[args.first_name, args.last_name].filter(Boolean).join(" ") || "your doctor"} in the national clinician registry`;
    case "check_drug": return `Checking ${args.drug_name ?? "that medication"} in the national drug database`;
    case "find_plans": return "Comparing plans in your area";
    case "estimate_annual_cost": return `Estimating a year on ${args.plan_name ?? "that plan"}`;
    case "get_advisor_availability": return "Checking the licensed advisors' calendar";
    case "book_advisor_call": return "Booking your advisor call";
    case "remember_preference": return "Saving that for next time";
    case "show_plan_details": return `Opening ${args.plan_name ?? "that plan"}`;
    default: return "Working on it";
  }
}

// What Anna found, in one line for the conversation view.
export function summaryFor(card: Card): string {
  switch (card.kind) {
    case "doctor":
      return `Found ${card.data.name}${card.data.acceptsMedicare ? ", accepts Medicare" : ""}. In ${card.data.included.length} of ${card.data.plans.length} plan networks.`;
    case "doctor_options": return `Found ${card.data.length} possible matches`;
    case "drug": {
      const covered = card.data.coverage.filter((c) => c.covered).length;
      return `${card.data.name}${card.data.strength ? ` ${card.data.strength}` : ""}: covered by ${covered} of ${card.data.coverage.length} plans`;
    }
    case "plans": return `Compared ${card.data.plans.length} plans in ${card.data.area ?? "your area"}`;
    case "cost": return `A year on ${card.data.plan}: about $${Math.round(card.data.total).toLocaleString()}`;
    case "availability": return `Found ${card.data.length} open times`;
    case "booking": return `Booked with ${card.data.advisor}: ${card.data.when}`;
    case "preference": return `Noted: ${card.data.preference}`;
    case "plan_details": return `Showing ${card.data.name}`;
  }
}

export function callReducer(state: CallState, action: CallAction): CallState {
  switch (action.type) {
    case "line": {
      if (!action.text.trim() || state.lines.some((l) => l.id === action.id)) return state;
      // A typed message can come back from Tavus as a user utterance too; keep the one we showed.
      if (action.role === "user" && !action.typed && state.lines.some((l) => l.typed && l.text.trim() === action.text.trim())) return state;
      const line: Line = { id: action.id, role: action.role, text: action.text, at: Date.now(), typed: action.typed };
      return { ...state, lines: [...state.lines, line] };
    }
    case "speaking":
      return { ...state, speaking: action.role };
    case "tool_started": {
      if (state.activity.some((a) => a.id === action.toolCallId)) return state;
      const row: Activity = { id: action.toolCallId, name: action.name, label: pendingLabel(action.name, action.args), args: action.args, done: false, at: Date.now() };
      return { ...state, activity: [...state.activity, row] };
    }
    case "tool_finished": {
      // Server-side tools finish without a tool_call_id on our side; match the latest open row by name.
      const open = [...state.activity].reverse().find((a) => !a.done && (action.toolCallId ? a.id === action.toolCallId : a.name === action.name));
      const summary = action.card ? summaryFor(action.card) : action.failed ? "Couldn't check that just now" : undefined;
      const itemKey = action.card ? keyFor(action.card) : undefined;
      const finished = { done: true, summary, ms: action.ms, itemKey, failed: action.failed };
      const activity = open
        ? state.activity.map((a) => (a === open ? { ...a, ...finished } : a))
        : action.card
          ? [...state.activity, { id: `${action.name}-${Date.now()}`, name: action.name, label: summary!, args: {}, at: Date.now(), ...finished }]
          : state.activity;
      if (!action.card) return { ...state, activity };

      const key = keyFor(action.card);
      const item: FileItem = { ...action.card, key, tool: action.name, at: Date.now() };
      let items = state.items.filter((i) => i.key !== key);
      // A verified doctor replaces the "which one?" list that preceded it.
      if (action.card.kind === "doctor") items = items.filter((i) => i.kind !== "doctor_options");
      // Once booked, the open-times card has done its job.
      if (action.card.kind === "booking") items = items.filter((i) => i.kind !== "availability");
      return { ...state, activity, items: [item, ...items] };
    }
    case "flag": // a guardrail fired: shown in the conversation like a failed lookup
      if (state.activity.some((a) => a.id === action.id)) return state;
      return { ...state, activity: [...state.activity, { id: action.id, name: "guardrail", label: action.label, summary: action.label, args: {}, done: true, failed: true, at: Date.now() }] };
    case "ended":
      return { ...state, ended: true, speaking: null };
  }
}
