"use client";

import { useState, useEffect, useRef } from "react";
import { voteSubmission } from "../lib/feedback-api";
import { getAnonToken } from "../lib/anon-token";
import { getDeviceFingerprint } from "../lib/device-fingerprint";
import { supabase } from "../lib/supabase";
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
 * - Anonymous users: votes tracked with device fingerprint + anon_token (prevents repeat voting on same device).
 * - Logged-in accounts: votes tracked by user_id and synced from Supabase (exempt from device limits).
 */
export function useVoting(feed: PublishedSubmission[], setFeed: React.Dispatch<React.SetStateAction<PublishedSubmission[]>>) {
  const { toast } = useToast();
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [votingId, setVotingId] = useState<string | null>(null);

  // Sync user's voted IDs:
  // 1. Initial fast hydration from localStorage
  // 2. If logged in, fetch from Supabase 'votes' table by user_id
  useEffect(() => {
    try {
      const raw = localStorage.getItem("sf_voted") ?? localStorage.getItem("cv_voted");
      if (raw) setVotedIds(new Set(JSON.parse(raw) as string[]));
    } catch { /* ignore */ }

    async function syncAuthVotes() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: userVotes } = await supabase
          .from("votes")
          .select("submission_id")
          .eq("user_id", session.user.id);
        if (userVotes) {
          const authIds = new Set(userVotes.map((v) => v.submission_id));
          setVotedIds(authIds);
          localStorage.setItem("sf_voted", JSON.stringify([...authIds]));
        }
      }
    }

    syncAuthVotes();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        supabase
          .from("votes")
          .select("submission_id")
          .eq("user_id", session.user.id)
          .then(({ data }) => {
            if (data) {
              const ids = new Set(data.map((v) => v.submission_id));
              setVotedIds(ids);
              localStorage.setItem("sf_voted", JSON.stringify([...ids]));
            }
          });
      } else if (event === "SIGNED_OUT") {
        // Clear account votes and revert to device local votes
        try {
          const raw = localStorage.getItem("sf_voted");
          setVotedIds(raw ? new Set(JSON.parse(raw)) : new Set());
        } catch {
          setVotedIds(new Set());
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function handleVote(id: string) {
    if (votingId) return; // prevent double-fire
    const isUnvote = votedIds.has(id);
    const action = isUnvote ? "unvote" : "vote";

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
      const deviceFp = await getDeviceFingerprint();
      const { voteCount } = await voteSubmission(id, getAnonToken(), deviceFp, action);

      // Refresh recently-voted timestamp so trailing DB trigger broadcasts don't override
      markRecentlyVoted(id);

      // Only apply server count if it's a valid non-negative number
      if (typeof voteCount === "number" && voteCount >= 0) {
        setFeed((cur) => cur.map((item) => item.id === id ? { ...item, vote_count: voteCount } : item));
      }
    } catch (error) {
      recentVoteMap.delete(id);
      const isAlreadyVoted = error instanceof Error && (
        error.message.includes("already supported") ||
        error.message.includes("already voted")
      );

      if (isAlreadyVoted) {
        // Device already voted anonymously: keep as voted in UI, but revert optimistic count
        const syncedVoted = new Set(votedIds);
        syncedVoted.add(id);
        setVotedIds(syncedVoted);
        localStorage.setItem("sf_voted", JSON.stringify([...syncedVoted]));
        setFeed((cur) =>
          cur.map((item) =>
            item.id === id
              ? { ...item, vote_count: preVoteCount }
              : item
          )
        );
        toast(error.message, "info");
      } else {
        // Revert to pre-vote snapshot
        const revertVotedIds = new Set(votedIds);
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
      }
    } finally { setVotingId(null); }
  }

  return { votedIds, votingId, handleVote, isRecentlyVoted };
}


