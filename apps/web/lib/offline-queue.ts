"use client";
import Dexie, { type EntityTable } from "dexie";

export type DraftAttachment = { name: string; type: string; blob: Blob };
export type Draft = { id: string; title: string; description: string; category: string; isAnonymous: boolean; consent: true; attachments: DraftAttachment[]; createdAt: number; attempts: number; syncStatus: "queued" | "syncing" | "failed"; lastError?: string };
const db = new Dexie("campus-voice") as Dexie & { drafts: EntityTable<Draft, "id"> };
db.version(2).stores({ drafts: "id, createdAt, syncStatus" });
export const drafts = db.drafts;

export async function addDraft(input: Omit<Draft, "id" | "createdAt" | "attempts" | "syncStatus">) {
  return drafts.add({ ...input, id: crypto.randomUUID(), createdAt: Date.now(), attempts: 0, syncStatus: "queued" });
}
export async function queuedDrafts() { return drafts.where("syncStatus").anyOf("queued", "failed").sortBy("createdAt"); }
