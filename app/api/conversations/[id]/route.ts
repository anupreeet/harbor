import { currentUser } from "@/lib/auth";
import { formatSlot } from "@/lib/calendar";
import { queryOne } from "@/lib/db";

// Polled by the call screen to pick up results of server-side tools: Tavus calls those
// directly, so the browser never sees their output on the data channel.
export async function GET(_request: Request, ctx: RouteContext<"/api/conversations/[id]">) {
  const { id } = await ctx.params;
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in again." }, { status: 401 });

  const convo = await queryOne<{ status: string }>(`SELECT status FROM conversations WHERE id = $1 AND contact_id = $2`, [id, user.id]);
  if (!convo) return Response.json({ error: "Not found." }, { status: 404 });

  // Only a booking made (or moved) during this call.
  const b = await queryOne<{ id: string; slot_start: string; time_zone: string; advisor_name: string }>(
    `SELECT id, slot_start, time_zone, advisor_name FROM bookings WHERE contact_id = $1 AND conversation_id = $2 AND slot_start > now()`,
    [user.id, id],
  );
  return Response.json({
    status: convo.status,
    booking: b && { bookingId: b.id, when: formatSlot(new Date(b.slot_start), b.time_zone), advisor: b.advisor_name },
  });
}
