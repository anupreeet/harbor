"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { addNote, cancelBooking, removeFacts, removePreferences, upcomingBooking } from "@/lib/crm";

// The caller fixing their own file, the same edits Anna makes with remove_from_file. Every
// write is scoped to the signed-in contact, so a forged key can only touch their own rows.
const Remove = z.object({
  what: z.enum(["doctor", "drug", "booking", "preference"]),
  key: z.string().max(300),
  name: z.string().max(200),
});

export async function removeFromFile(formData: FormData) {
  const user = await requireUser();
  const { what, key, name } = Remove.parse(Object.fromEntries(formData));
  if (what === "booking") {
    const booking = await upcomingBooking(user.id);
    if (booking?.id === key) await cancelBooking(user.id, key);
  } else if (what === "preference") {
    await removePreferences(user.id, [key]);
  } else {
    await removeFacts(user.id, what, [key]);
  }
  await addNote(user.id, `Removed from file on the coverage page: ${name}.`);
  revalidatePath("/app/file");
}
