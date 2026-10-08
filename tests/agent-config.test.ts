import { describe, expect, it } from "vitest";
import { getTool, TOOL_SPECS } from "@/lib/tools/registry";

// Guards the agent config in agent/tools.json — the file a coding agent is most likely to edit.
describe("agent/tools.json", () => {
  it("every tool has a handler and a valid delivery", () => {
    for (const spec of TOOL_SPECS) {
      expect(getTool(spec.name), spec.name).not.toBeNull();
      expect(["client", "server"]).toContain(spec.delivery);
      expect(spec.name).toMatch(/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/);
    }
  });

  it("tools never default to fire_and_forget (Anna would ignore the result)", () => {
    for (const spec of TOOL_SPECS) {
      expect(spec.on_resolve, spec.name).toBeDefined();
      expect(spec.on_resolve, spec.name).not.toBe("fire_and_forget");
    }
  });

  it("stays inside Tavus limits", () => {
    for (const spec of TOOL_SPECS) {
      expect(spec.description.length + JSON.stringify(spec.parameters).length, spec.name).toBeLessThan(10_000);
      for (const key of Object.keys(spec.parameters.properties)) expect(key.startsWith("tavus_"), key).toBe(false);
      for (const req of spec.parameters.required ?? []) expect(spec.parameters.properties, spec.name).toHaveProperty(req);
    }
  });
});
