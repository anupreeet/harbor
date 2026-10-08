import type { Card } from "./cards";

export type ToolDelivery = "client" | "server";

export type JsonSchema = {
  type: "object";
  properties: Record<string, { type: string; description?: string; enum?: string[]; maxLength?: number }>;
  required?: string[];
};

export type ToolSpec = {
  name: string;
  delivery: ToolDelivery;
  description: string;
  parameters: JsonSchema;
  on_call?: "generate_filler" | "static_filler" | "silent" | "passthrough";
  on_resolve?: "generate_response" | "response_in_result" | "add_to_context" | "fire_and_forget";
  sources: string[]; // shown to the caller; not sent to Tavus
};

// Who the tool is acting for. Resolved server-side from the conversation id — the model
// never supplies identity, location or time zone.
export type ToolContext = {
  conversationId: string;
  contact: {
    id: string;
    firstName: string;
    city: string | null;
    state: string | null;
    countyName: string | null;
    timeZone: string;
  };
};

// `speak` goes back to the LLM (must stay well under Tavus's 4 KB app-message cap);
// `card` is the richer payload the browser renders next to the video.
export type ToolResult = {
  speak: Record<string, unknown>;
  card?: Card;
};

export type ToolHandler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
