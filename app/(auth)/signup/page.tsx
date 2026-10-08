import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { currentUser } from "@/lib/auth";
import { signUp } from "../actions";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignUpPage() {
  if (await currentUser()) redirect("/app");
  return (
    <AuthForm
      title="Create your account"
      intro="Your account keeps what Anna checks, so you never have to repeat yourself."
      action={signUp}
      submit="Create account"
      fields={[
        { name: "firstName", label: "First name", autoComplete: "given-name", maxLength: 40, placeholder: "Bob" },
        { name: "email", label: "Email", type: "email", autoComplete: "email", inputMode: "email", placeholder: "you@example.com" },
        { name: "zip", label: "ZIP code", hint: "Plans depend on where you live.", autoComplete: "postal-code", inputMode: "numeric", maxLength: 5, placeholder: "60614" },
        { name: "password", label: "Password", type: "password", autoComplete: "new-password", hint: "At least 8 characters." },
        ...(process.env.INVITE_CODE ? [{ name: "invite", label: "Invite code", autoComplete: "off" }] : []),
      ]}
      footer={{ text: "Already have an account?", link: "Sign in", href: "/login" }}
    />
  );
}
