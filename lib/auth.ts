import "server-only";
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getContact, type Contact } from "./crm";

// Email + password accounts with a stateless signed session cookie. No auth vendor: the
// whole mechanism is this file, and every page, action and route resolves the user here.

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(password, Buffer.from(salt, "base64url"), expected.length);
  return timingSafeEqual(actual, expected);
}

// The cookie is "<contactId>.<expires, unix seconds>.<HMAC of both>". Nothing is stored
// server-side; rotating SESSION_SECRET signs everyone out.
const COOKIE = "harbor_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function sign(payload: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set (32+ characters)");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function sealSession(contactId: string, now = Date.now()): string {
  const payload = `${contactId}.${Math.floor(now / 1000) + MAX_AGE_SECONDS}`;
  return `${payload}.${sign(payload)}`;
}

export function openSession(token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const cut = token.lastIndexOf(".");
  const payload = token.slice(0, cut);
  const given = Buffer.from(token.slice(cut + 1));
  const expected = Buffer.from(sign(payload));
  if (cut < 0 || given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const [contactId, expires] = payload.split(".");
  return Number(expires) * 1000 > now ? contactId : null;
}

export async function startSession(contactId: string) {
  (await cookies()).set(COOKIE, sealSession(contactId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function currentUser(): Promise<Contact | null> {
  const id = openSession((await cookies()).get(COOKIE)?.value);
  return id ? getContact(id) : null;
}

export async function requireUser(): Promise<Contact> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

// Roles are ordinary accounts whose email is listed in an env var (comma-separated, any case).
function listed(variable: string | undefined, email: string): boolean {
  const list = (variable ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}

// Licensed advisors (ADVISOR_EMAILS) open the advisor console.
export function isAdvisor(email: string): boolean {
  return listed(process.env.ADVISOR_EMAILS, email);
}

// Admins (ADMIN_EMAILS) see every conversation's agent trace and run the evals.
export function isAdmin(email: string): boolean {
  return listed(process.env.ADMIN_EMAILS, email);
}
