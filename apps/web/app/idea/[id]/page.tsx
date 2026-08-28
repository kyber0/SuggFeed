import { Metadata, ResolvingMetadata } from "next";
import { notFound } from "next/navigation";
import { loadSingleSubmission } from "../../../lib/feedback-api";
import { IdeaClient } from "./idea-client";
import { Header } from "../../../components/header";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const { id } = await params;
  const idea = await loadSingleSubmission(id);

  if (!idea) {
    return { title: "Idea Not Found | SuggFeed" };
  }

  return {
    title: `${idea.title} | SuggFeed`,
    description: idea.description,
    openGraph: {
      title: idea.title,
      description: idea.description,
      type: "website",
    },
  };
}

export default async function IdeaPage({ params }: Props) {
  const { id } = await params;
  const idea = await loadSingleSubmission(id);

  if (!idea) {
    notFound();
  }

  return (
    <>
      <Header />
      <main className="standalone-idea-page">
        <IdeaClient initialIdea={idea} turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
      </main>
    </>
  );
}
