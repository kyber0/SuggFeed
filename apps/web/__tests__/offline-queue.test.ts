import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { addDraft, drafts, queuedDrafts } from "../lib/offline-queue";

describe("offline-queue", () => {
  beforeEach(async () => {
    await drafts.clear();
  });

  afterEach(async () => {
    await drafts.clear();
  });

  it("addDraft inserts a draft with queued status", async () => {
    await addDraft({
      title: "Fix the broken heater",
      description: "The heater in room 204 has been broken for three weeks and students are cold.",
      category: "Facilities",
      isAnonymous: true,
      consent: true,
      attachments: [],
    });

    const count = await drafts.count();
    expect(count).toBe(1);

    const [draft] = await drafts.toArray();
    expect(draft.syncStatus).toBe("queued");
    expect(draft.attempts).toBe(0);
    expect(draft.title).toBe("Fix the broken heater");
    expect(typeof draft.id).toBe("string");
    expect(draft.createdAt).toBeGreaterThan(0);
  });

  it("addDraft generates unique IDs for multiple drafts", async () => {
    const base = {
      title: "Add more seating",
      description: "There are never enough seats in the library during exam season, please add more.",
      category: "Facilities",
      isAnonymous: true,
      consent: true as const,
      attachments: [],
    };
    await addDraft(base);
    await addDraft({ ...base, title: "Fix the projector" });

    const all = await drafts.toArray();
    expect(all).toHaveLength(2);
    expect(all[0].id).not.toBe(all[1].id);
  });

  it("queuedDrafts returns queued and failed drafts only", async () => {
    const base = {
      title: "Test idea with enough characters",
      description: "This is the description with enough characters to pass validation requirements here.",
      category: "Other",
      isAnonymous: true,
      consent: true as const,
      attachments: [],
    };
    await addDraft(base);
    const all = await drafts.toArray();
    await drafts.update(all[0].id, { syncStatus: "syncing" });
    await addDraft({ ...base, title: "Another queued idea that is long enough" });

    const queued = await queuedDrafts();
    expect(queued).toHaveLength(1);
    expect(queued[0].syncStatus).toBe("queued");
  });

  it("queuedDrafts includes failed drafts", async () => {
    const base = {
      title: "Report a safety issue near the gym",
      description: "There is a broken railing near the gym entrance that could cause injury to students.",
      category: "Safety",
      isAnonymous: false,
      consent: true as const,
      attachments: [],
    };
    await addDraft(base);
    const [draft] = await drafts.toArray();
    await drafts.update(draft.id, { syncStatus: "failed" });

    const queued = await queuedDrafts();
    expect(queued).toHaveLength(1);
    expect(queued[0].syncStatus).toBe("failed");
  });
});
