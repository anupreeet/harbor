import { Wordmark } from "@/components/brand";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 bg-muted px-4 py-10">
      <Wordmark />
      <main className="w-full max-w-sm">{children}</main>
      <p className="max-w-sm text-center text-xs text-balance text-muted-foreground">
        Harbor is an independent licensed insurance brokerage, not Medicare or the government. Anna is an AI assistant.
      </p>
    </div>
  );
}
