"use client";

import { useState, useEffect, useRef } from "react";
import { voteSubmission } from "../lib/feedback-api";
import { getAnonToken } from "../lib/anon-token";
import { useToast } from "../components/toast";
import type { PublishedSubmission } from "../lib/feedback-api";

// Module-level recent vote tracker so Realtime listeners across any component
// know not to overwrite an in-flight / recently-confirmed vote with a stale DB trigger broadcast.
const recentVoteMap = new Map<string, number>();

export function markRecentlyVoted(id: string) {
  recentVoteMap.set(id, Date.now());
}

export function isRecentlyVoted(id: string): boolean {
  const t = recentVoteMap.get(id);
  if (!t) return false;
  if (Date.now() - t > 5000) {
    recentVoteMap.delete(id);
    return false;
  }
  return true;
}

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

    // Mark as recently voted immediately to block stale Realtime trigger broadcasts
    markRecentlyVoted(id);

    // Capture pre-vote count snapshot to allow correct revert on failure
    const preVoteItem = feed.find((i) => i.id === id);
    const preVoteCount = preVoteItem?.vote_count ?? 0;

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
      // Refresh recently-voted timestamp so trailing DB trigger broadcasts don't override
      markRecentlyVoted(id);
      // Only apply server count if it's a valid non-negative number
      if (typeof voteCount === "number" && voteCount >= 0) {
        setFeed((cur) => cur.map((item) => item.id === id ? { ...item, vote_count: voteCount } : item));
      }
    } catch (error) {
      recentVoteMap.delete(id);
      // Revert to pre-vote snapshot (not stale closure)
      const revertVotedIds = new Set(votedIds); // original state before this vote
      setVotedIds(revertVotedIds);
      setFeed((cur) =>
        cur.map((item) =>
          item.id === id
            ? { ...item, vote_count: preVoteCount }
            : item
        )
      );
      localStorage.setItem("sf_voted", JSON.stringify([...revertVotedIds]));
      toast(error instanceof Error ? error.message : "Couldn't record your vote.", "error");
    } finally { setVotingId(null); }
  }

  return { votedIds, votingId, handleVote, isRecentlyVoted };
}


