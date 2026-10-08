"use client";

import { Briefcase, ChevronsUpDown, FileText, House, LogOut, Monitor, Moon, ShieldCheck, Sun, Video } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Wordmark } from "@/components/brand";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

type Conversation = { id: string; title: string; when: string; live: boolean };

export function AppSidebar({
  user,
  conversations,
  signOut,
}: {
  user: { firstName: string; email: string; advisor: boolean; admin: boolean };
  conversations: Conversation[];
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  // `section`: active on any page under it (Admin has sub-pages), not just its own URL.
  const nav = [
    { href: "/app", label: "Home", Icon: House, section: false },
    { href: "/app/file", label: "Your coverage", Icon: FileText, section: false },
    ...(user.advisor ? [{ href: "/app/advisor", label: "Advisor console", Icon: Briefcase, section: false }] : []),
    ...(user.admin ? [{ href: "/app/admin", label: "Admin", Icon: ShieldCheck, section: true }] : []),
  ];

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader className="gap-3">
        <Wordmark href="/app" className="px-1 py-1 group-data-[collapsible=icon]:[&>span]:hidden" />
        <Button asChild className="h-10 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0">
          <Link href="/app/call" aria-label="New call with Anna">
            <Video />
            <span className="group-data-[collapsible=icon]:hidden">New call with Anna</span>
          </Link>
        </Button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {nav.map(({ href, label, Icon, section }) => (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton asChild isActive={pathname === href || (section && pathname.startsWith(`${href}/`))} tooltip={label}>
                  <Link href={href}>
                    <Icon />
                    <span>{label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Conversations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {conversations.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">Your calls with Anna will appear here.</p>
              ) : null}
              {conversations.map((c) => (
                <SidebarMenuItem key={c.id}>
                  <SidebarMenuButton asChild isActive={pathname === `/app/c/${c.id}`} className="h-auto py-2">
                    <Link href={`/app/c/${c.id}`}>
                      <span className="grid min-w-0">
                        <span className="truncate">{c.title}</span>
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {c.live ? <span className="size-1.5 rounded-full bg-destructive" aria-label="In progress" /> : null}
                          {c.when}
                        </span>
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <UserMenu user={user} signOut={signOut} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function UserMenu({ user, signOut }: { user: { firstName: string; email: string }; signOut: () => Promise<void> }) {
  const { theme, setTheme } = useTheme();
  const initial = user.firstName.slice(0, 1).toUpperCase();
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent" aria-label="Account menu">
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg bg-primary/10 font-medium text-primary">{initial}</AvatarFallback>
              </Avatar>
              <span className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.firstName}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </span>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-60" side="top" align="start">
            <DropdownMenuLabel className="font-normal">
              <span className="block font-medium">{user.firstName}</span>
              <span className="block text-xs text-muted-foreground">{user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Appearance</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light"><Sun /> Light</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark"><Moon /> Dark</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system"><Monitor /> System</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <form action={signOut} className="w-full">
                <button type="submit" className="flex w-full items-center gap-2">
                  <LogOut className="size-4" /> Sign out
                </button>
              </form>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
