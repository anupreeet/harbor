"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { endSession, hashPassword, startSession, verifyPassword } from "@/lib/auth";
import { checkInviteCode } from "@/lib/conversation/gate";
import { createContact, getLogin } from "@/lib/crm";
import { UpstreamError } from "@/lib/integrations/http";
import { resolveZip } from "@/lib/integrations/geo";

export type AuthState = { error: string; values: Record<string, string> } | undefined;

const SignUp = z.object({
  firstName: z.string().trim().min(1, "Enter your first name.").max(40),
  email: z.email("Enter a valid email address.").max(120),
  zip: z.string().trim().regex(/^\d{5}$/, "Enter your 5-digit ZIP code."),
  password: z.string().min(8, "Use at least 8 characters for your password.").max(200),
  invite: z.string().max(64).optional(),
});

// Everything the person typed except the password, so a failed submit doesn't clear the form.
const keep = (form: FormData) =>
  Object.fromEntries([...form.entries()].filter(([k, v]) => k !== "password" && typeof v === "string")) as Record<string, string>;

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  const values = keep(form);
  const parsed = SignUp.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const input = parsed.data;
  if (!checkInviteCode(input.invite)) return { error: "That invite code isn't right.", values };

  let place;
  try {
    place = await resolveZip(input.zip);
  } catch (err) {
    const unknown = err instanceof UpstreamError && err.message.includes("unknown");
    return { error: unknown ? "We couldn't find that ZIP code." : "We couldn't check that ZIP code just now. Please try again.", values };
  }

  const contact = await createContact({
    email: input.email,
    passwordHash: await hashPassword(input.password),
    firstName: input.firstName,
    zip: input.zip,
    city: place.city,
    state: place.state,
    countyName: place.countyName,
    countyFips: place.countyFips,
  });
  if (!contact) return { error: "There's already an account with that email. Sign in instead.", values };
  await startSession(contact.id);
  redirect("/app");
}

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const values = keep(form);
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const login = email ? await getLogin(email) : null;
  if (!login || !(await verifyPassword(password, login.password_hash))) {
    return { error: "That email and password don't match an account.", values };
  }
  await startSession(login.id);
  redirect("/app");
}

export async function signOut() {
  await endSession();
  redirect("/");
}
