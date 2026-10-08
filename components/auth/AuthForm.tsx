"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import type { AuthState } from "@/app/(auth)/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Field = {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  hint?: string;
  inputMode?: "numeric" | "email";
  maxLength?: number;
  placeholder?: string;
};

export function AuthForm({
  title,
  intro,
  fields,
  submit,
  action,
  footer,
}: {
  title: string;
  intro: string;
  fields: Field[];
  submit: string;
  action: (prev: AuthState, form: FormData) => Promise<AuthState>;
  footer: { text: string; link: string; href: string };
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription>{intro}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-5" noValidate>
          {fields.map((f) => (
            <div key={f.name} className="grid gap-2">
              <Label htmlFor={f.name}>{f.label}</Label>
              <Input
                id={f.name}
                name={f.name}
                type={f.type ?? "text"}
                autoComplete={f.autoComplete}
                inputMode={f.inputMode}
                maxLength={f.maxLength}
                placeholder={f.placeholder}
                defaultValue={f.type === "password" ? undefined : state?.values[f.name]}
                aria-describedby={f.hint ? `${f.name}-hint` : undefined}
                className="h-10"
              />
              {f.hint ? (
                <p id={`${f.name}-hint`} className="text-xs text-muted-foreground">
                  {f.hint}
                </p>
              ) : null}
            </div>
          ))}
          {state?.error ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" size="lg" className="h-10 w-full" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {submit}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {footer.text}{" "}
            <Link href={footer.href} className="font-medium text-foreground underline underline-offset-4">
              {footer.link}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
