"use client";

import { useState, useEffect } from "react";
import { voteSubmission } from "../lib/feedback-api";
import { getAnonToken } from "../lib/anon-token";
import { useToast } from "../components/toast";
import type { PublishedSubmission } from "../lib/feedback-api";

/**
 * Shared optimistic-voting hook.
 * Previously duplicated identically in sugg-feed.tsx and community-feed.tsx.
 */
export function useVoting(feed: PublishedSubmission[], setFeed: React.Dispatch<React.SetStateAction<PublishedSubmission[]>>) {
  const { toast } = useToast();
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [votingId, setVotingId] = useState<string | null>(null);

  // Hydrate from localStorage after mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem("sf_voted") ?? localStorage.getItem("cv_voted");
      if (raw) setVotedIds(new Set(JSON.parse(raw) as string[]));
    } catch { /* ignore */ }
  }, []);

  async function handleVote(id: string) {
    if (votingId) return; // prevent double-fire
    const isUnvote = votedIds.has(id);

    // ── Optimistic update ─────────────────────────────
    const nextVotedIds = new Set(votedIds);
    if (isUnvote) { nextVotedIds.delete(id); } else { nextVotedIds.add(id); }
    setVotedIds(nextVotedIds);
    localStorage.setItem("sf_voted", JSON.stringify([...nextVotedIds]));
    setFeed((cur) =>
      cur.map((item) =>
        item.id === id
          ? { ...item, vote_count: Math.max(0, item.vote_count + (isUnvote ? -1 : 1)) }
          : item
      )
    );

    // ── Background sync ───────────────────────────────
    setVotingId(id);
    try {
      const { voteCount } = await voteSubmission(id, getAnonToken());
      setFeed((cur) => cur.map((item) => item.id === id ? { ...item, vote_count: voteCount } : item));
    } catch (error) {
      // Revert on failure
      setVotedIds(new Set(votedIds));
      setFeed((cur) =>
        cur.map((item) =>
          item.id === id
            ? { ...item, vote_count: Math.max(0, item.vote_count + (isUnvote ? 1 : -1)) }
            : item
        )
      );
      localStorage.setItem("sf_voted", JSON.stringify([...votedIds]));
      toast(error instanceof Error ? error.message : "Couldn't record your vote.", "error");
    } finally { setVotingId(null); }
  }

  return { votedIds, votingId, handleVote };
}
