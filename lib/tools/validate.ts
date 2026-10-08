import type { JsonSchema } from "./types";

// Validates tool arguments against the same JSON Schema we register with Tavus, so the
// contract lives in one place (agent/tools.json). Our schemas are flat objects of
// strings/numbers, so a small validator is enough.

export class ToolArgumentError extends Error {}

export function parseArguments(raw: unknown, schema: JsonSchema): Record<string, unknown> {
  let args: unknown = raw;
  if (typeof raw === "string") {
    try {
      args = raw.trim() ? JSON.parse(raw) : {};
    } catch {
      throw new ToolArgumentError("arguments is not valid JSON");
    }
  }
  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    throw new ToolArgumentError("arguments must be an object");
  }

  const input = args as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(schema.properties)) {
    const value = input[key];
    if (value === undefined || value === null) continue;
    if (value === "") {
      if (schema.required?.includes(key)) out[key] = ""; // a required field sent empty means "not said"
      continue;
    }
    if (prop.type === "string") {
      if (typeof value !== "string") throw new ToolArgumentError(`${key} must be a string`);
      const v = value.trim();
      if (prop.maxLength && v.length > prop.maxLength) throw new ToolArgumentError(`${key} is too long`);
      if (prop.enum && !prop.enum.includes(v)) throw new ToolArgumentError(`${key} must be one of ${prop.enum.join(", ")}`);
      out[key] = v;
    } else if (prop.type === "number") {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) throw new ToolArgumentError(`${key} must be a number`);
      out[key] = n;
    } else {
      out[key] = value;
    }
  }
  for (const key of schema.required ?? []) {
    if (out[key] === undefined) throw new ToolArgumentError(`${key} is required`);
  }
  return out;
}
