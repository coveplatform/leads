import type { Metadata } from "next";
import { EventsViewer } from "@/components/demo/EventsViewer";

export const metadata: Metadata = { title: "Demo events" };

export default function EventsPage() {
  return <EventsViewer />;
}
