import "server-only";
import agentTools from "@/agent/tools.json";
import { queryOne } from "../db";
import { timeZoneForState } from "../integrations/geo";
import { getAdvisorAvailability, bookAdvisorCall, rememberPreference } from "./advisor";
import { lookupDoctor } from "./doctor";
import { checkDrug } from "./drug";
import { removeFromFile, showFile } from "./file";
import { estimateAnnualCost, findPlans, showPlanDetails } from "./plans";
import type { ToolContext, ToolHandler, ToolSpec } from "./types";

// JSON imports widen literal types; tests/agent-config.test.ts checks the file's shape.
export const TOOL_SPECS = agentTools.tools as unknown as ToolSpec[];

const HANDLERS: Partial<Record<string, ToolHandler>> = {
  lookup_doctor: lookupDoctor,
  check_drug: checkDrug,
  find_plans: findPlans,
  estimate_annual_cost: estimateAnnualCost,
  show_plan_details: showPlanDetails,
  get_advisor_availability: getAdvisorAvailability,
  book_advisor_call: bookAdvisorCall,
  remember_preference: rememberPreference,
  remove_from_file: removeFromFile,
  show_file: showFile,
};

export function getTool(name: string): { spec: ToolSpec; handler: ToolHandler } | null {
  const spec = TOOL_SPECS.find((t) => t.name === name);
  const handler = HANDLERS[name];
  return spec && handler ? { spec, handler } : null;
}

export async function loadToolContext(conversationId: string): Promise<ToolContext | null> {
  const row = await queryOne<{
    contact_id: string; first_name: string; city: string | null; state: string | null; county_name: string | null;
  }>(
    `SELECT k.id AS contact_id, k.first_name, k.city, k.state, k.county_name
       FROM conversations c JOIN contacts k ON k.id = c.contact_id WHERE c.id = $1 AND c.status = 'active'`,
    [conversationId],
  );
  if (!row) return null;
  return {
    conversationId,
    contact: {
      id: row.contact_id,
      firstName: row.first_name,
      city: row.city,
      state: row.state,
      countyName: row.county_name,
      timeZone: timeZoneForState(row.state ?? ""),
    },
  };
}
