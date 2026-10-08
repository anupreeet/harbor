import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { currentUser } from "@/lib/auth";
import { signIn } from "../actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/app");
  return (
    <AuthForm
      title="Welcome back"
      intro="Sign in to talk with Anna and see your coverage file."
      action={signIn}
      submit="Sign in"
      fields={[
        { name: "email", label: "Email", type: "email", autoComplete: "email", inputMode: "email", placeholder: "you@example.com" },
        { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
      ]}
      footer={{ text: "New to Harbor?", link: "Create an account", href: "/signup" }}
    />
  );
}
