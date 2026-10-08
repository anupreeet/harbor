import { PageHeader } from "@/components/app/PageHeader";
import { isAdmin, requireUser } from "@/lib/auth";
import { AdminNav } from "./AdminNav";

// Admin area: every conversation's agent trace, and the evals. Admins are accounts listed in
// ADMIN_EMAILS. Each page checks access itself; the layout only hides the tabs from non-admins.
export default async function AdminLayout({ children }: LayoutProps<"/app/admin">) {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Admin" />
      {isAdmin(user.email) ? <AdminNav /> : null}
      {children}
    </>
  );
}
