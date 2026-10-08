import { cookies } from "next/headers";
import { AppSidebar } from "@/components/app/AppSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { isAdmin, isAdvisor, requireUser } from "@/lib/auth";
import { listConversations } from "@/lib/crm";
import { whenLabel } from "@/lib/format";
import { timeZoneForState } from "@/lib/integrations/geo";
import { signOut } from "../(auth)/actions";

// Every page under /app is for a signed-in person: the sidebar holds their conversations,
// the main panel shows one view at a time (home, a call, a past call, their coverage file).
export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const user = await requireUser();
  const conversations = await listConversations(user.id);
  const tz = timeZoneForState(user.state ?? "");
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false"; // remembered by shadcn's sidebar

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar
        user={{ firstName: user.first_name, email: user.email, advisor: isAdvisor(user.email), admin: isAdmin(user.email) }}
        conversations={conversations.map((c) => ({
          id: c.id,
          title: c.title ?? (c.live ? "Call in progress" : "Call with Anna"),
          when: whenLabel(c.created_at, tz),
          live: c.live,
        }))}
        signOut={signOut}
      />
      <SidebarInset className="min-h-0 overflow-hidden md:h-[calc(100svh-1rem)]">{children}</SidebarInset>
    </SidebarProvider>
  );
}
