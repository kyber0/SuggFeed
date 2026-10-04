const { supabase } = require("./supabase");

const DEFAULT_CATEGORIES = [
  "Facilities",
  "Learning",
  "Safety",
  "Student life",
  "Other",
];

const STATUS_LABELS = {
  pending: "Pending Review",
  approved: "Approved",
  in_progress: "In Progress",
  resolved: "Resolved",
};

/**
 * Load paginated feed of published submissions.
 * @param {object} opts
 * @param {string} opts.sortBy - "popular" | "newest" | "oldest"
 * @param {string} opts.filterCat - category name or "All"
 * @param {string} opts.search - search string
 * @param {number} opts.page - 0-indexed page number
 * @param {number} opts.limit - items per page
 */
async function loadFeed({ sortBy = "popular", filterCat = "All", search = "", page = 0, limit = 12 } = {}) {
  let query = supabase
    .from("submissions")
    .select(
      `id, title, description, status, vote_count, created_at, user_id, comment_count,
       author:profiles!submissions_user_id_fkey(display_name),
       categories(name),
       attachments(id)`,
      { count: "exact" }
    )
    .eq("status", "approved")
    .range(page * limit, page * limit + limit - 1);

  if (search) {
    query = query.ilike("title", `%${search}%`);
  }

  if (filterCat && filterCat !== "All") {
    // join filter via category name
    const { data: catRows } = await supabase
      .from("categories")
      .select("id")
      .eq("name", filterCat)
      .single();
    if (catRows?.id) {
      query = query.eq("category_id", catRows.id);
    }
  }

  if (sortBy === "newest") query = query.order("created_at", { ascending: false });
  else if (sortBy === "oldest") query = query.order("created_at", { ascending: true });
  else query = query.order("vote_count", { ascending: false }).order("created_at", { ascending: false });

  const { data, error, count } = await query;
  if (error) throw error;
  return { items: data ?? [], total: count ?? 0 };
}

/**
 * Load a single submission by ID.
 */
async function loadSubmission(id) {
  const { data, error } = await supabase
    .from("submissions")
    .select(
      `id, title, description, status, vote_count, created_at, user_id, comment_count,
       author:profiles!submissions_user_id_fkey(display_name),
       categories(name),
       attachments(id, mime_type, size_bytes, name)`
    )
    .eq("id", id)
    .single();
  if (error) return null;
  return data;
}

/**
 * Load comments for a submission.
 */
async function loadComments(submissionId) {
  const { data, error } = await supabase
    .from("comments")
    .select("id, body, display_name, created_at, parent_id, is_pinned, is_hidden, user_id")
    .eq("submission_id", submissionId)
    .eq("is_hidden", false)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) return [];
  return data ?? [];
}

/**
 * Load roadmap submissions grouped by status.
 */
async function loadRoadmap() {
  const { data, error } = await supabase
    .from("submissions")
    .select(
      `id, title, description, status, vote_count, created_at, comment_count,
       categories(name), attachments(id)`
    )
    .in("status", ["approved", "in_progress", "resolved"])
    .order("vote_count", { ascending: false });

  if (error) return { approved: [], in_progress: [], resolved: [] };

  const grouped = { approved: [], in_progress: [], resolved: [] };
  (data ?? []).forEach((item) => {
    if (grouped[item.status]) grouped[item.status].push(item);
  });
  return grouped;
}

/**
 * Lookup a submission by tracking code.
 */
async function lookupTrackingCode(code) {
  const { data, error } = await supabase
    .from("submissions")
    .select(`id, title, description, status, created_at, categories(name),
             status_history(new_status, created_at, note)`)
    .eq("tracking_code", code)
    .single();
  if (error || !data) return null;
  return data;
}

/**
 * Load user profile and their submissions.
 */
async function loadProfile(userId, accessToken) {
  const { getSupabase } = require("./supabase");
  const client = getSupabase(accessToken);

  const [profileRes, submissionsRes] = await Promise.all([
    client.from("profiles").select("*").eq("id", userId).single(),
    client
      .from("submissions")
      .select("id, title, status, vote_count, created_at, comment_count, categories(name)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  return {
    profile: profileRes.data,
    submissions: submissionsRes.data ?? [],
  };
}

/**
 * Load categories list.
 */
async function loadCategories() {
  const { data } = await supabase
    .from("categories")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  return (data ?? []).map((c) => c.name);
}

/**
 * Format a status string into a readable label.
 */
function readableStatus(status) {
  return STATUS_LABELS[status] ?? status;
}

module.exports = {
  DEFAULT_CATEGORIES,
  STATUS_LABELS,
  loadFeed,
  loadSubmission,
  loadComments,
  loadRoadmap,
  lookupTrackingCode,
  loadProfile,
  loadCategories,
  readableStatus,
};
