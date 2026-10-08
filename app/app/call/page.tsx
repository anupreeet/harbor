import type { Metadata } from "next";
import { CallRoomClient } from "@/components/call/CallRoomClient";
import { requireUser } from "@/lib/auth";
import { TOPICS, type Topic } from "@/lib/conversation/script";

export const metadata: Metadata = { title: "Call with Anna" };

// What the person picked on the home screen, in their words.
const ASKED: Record<Topic, string> = {
  doctor: "Is my doctor covered?",
  drugs: "What will my prescriptions cost?",
  compare: "Compare plans near me",
  advisor: "Talk to a licensed advisor",
};

export default async function CallPage({ searchParams }: PageProps<"/app/call">) {
  const user = await requireUser();
  const { topic } = await searchParams;
  const picked = typeof topic === "string" && topic in TOPICS ? (topic as Topic) : null;
  return <CallRoomClient topic={picked} topicLabel={picked ? ASKED[picked] : null} firstName={user.first_name} />;
}
