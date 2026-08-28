import { Metadata } from "next";
import { RoadmapBoard } from "../../../components/roadmap-board";

export const metadata: Metadata = {
  title: "Roadmap | SuggFeed",
  description: "Track the progress of highly requested ideas and see what's coming next.",
};

export default function RoadmapPage() {
  return <RoadmapBoard />;
}
