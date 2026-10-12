import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const STAFF_ID = '10000000-0000-4000-8000-000000000001';
export const USER_ID = '10000000-0000-4000-8000-000000000002';
export const OTHER_USER_ID = '10000000-0000-4000-8000-000000000003';
export const CATEGORY_ID = '20000000-0000-4000-8000-000000000001';
export const IDEA_ID = '30000000-0000-4000-8000-000000000001';
export const HIDDEN_ID = '30000000-0000-4000-8000-000000000002';

const migrations = path.resolve(__dirname, '../../../../supabase/migrations');
const migration = (name: string) => readFileSync(path.join(migrations, name), 'utf8');

/** Executes the real forward migrations against in-memory PostgreSQL, not SQL
 * string assertions. Auth/Storage are schema stubs, not live Supabase services;
 * single-connection PGlite does not prove multi-session lock contention. */
export async function createRoadmapDb(): Promise<PGlite> {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE SCHEMA storage;
      CREATE TABLE storage.buckets(id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL,
        file_size_limit bigint, allowed_mime_types text[]);
    `);
    await db.exec(migration('202608200001_initial_schema.sql'));
    await db.exec(migration('202608200003_comments.sql'));
    await db.exec(migration('202609280004_user_bookmarks_reports_shares.sql'));
    // Minimal pre-roadmap production baseline. The legacy vote recount was
    // removed by 202609280002; no count trigger is intentionally installed here.
    await db.exec(`
      ALTER TABLE public.submissions ADD COLUMN staff_note text;
      ALTER TABLE public.submissions ADD COLUMN comment_count integer NOT NULL DEFAULT 0;
      ALTER TABLE public.submissions ADD COLUMN resolved_at timestamptz;
      ALTER TABLE public.votes ADD COLUMN device_hash text;
      ALTER TABLE public.votes ADD COLUMN ip_hash text;
      CREATE UNIQUE INDEX votes_anonymous_device_unique ON public.votes(submission_id, device_hash)
        WHERE user_id IS NULL AND device_hash IS NOT NULL;
      ALTER TABLE public.status_history ADD CONSTRAINT status_history_changes_status
        CHECK(old_status IS DISTINCT FROM new_status);
      CREATE TABLE public.submission_workflow(submission_id uuid PRIMARY KEY REFERENCES public.submissions(id),
        assignee_id uuid REFERENCES public.profiles(id), priority text NOT NULL DEFAULT 'normal', target_date date);
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      GRANT SELECT ON public.submissions, public.categories, public.comments TO anon, authenticated;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    `);
    for (const name of [
      '202610110002_roadmap_consistency.sql',
      '202610110003_public_progress.sql',
      '202610110004_progress_evidence.sql',
      '202610110005_roadmap_engagement.sql',
      '202610120006_progress_evidence_hardening.sql',
      '202610120007_engagement_consistency.sql',
      '202610120008_community_workflows.sql',
      '202610120009_weekly_digests.sql',
      '202610130010_guided_workflows.sql',
    ]) {
      try { await db.exec(migration(name)); }
      catch (error: any) { const failure = new Error(`${name}: ${error.message} (position ${error.position ?? error.internalPosition ?? 'unknown'}; ${error.internalQuery ?? ''})`); (failure as any).cause = error; throw failure; }
    }
    await db.query('INSERT INTO auth.users(id) VALUES ($1), ($2), ($3)', [STAFF_ID, USER_ID, OTHER_USER_ID]);
    await db.query(`INSERT INTO public.profiles(id, role) VALUES ($1, 'moderator'), ($2, 'student'), ($3, 'student')`, [STAFF_ID, USER_ID, OTHER_USER_ID]);
    await db.query(`INSERT INTO public.categories(id,name,slug) VALUES ($1,'Test facilities','test-facilities')`, [CATEGORY_ID]);
    await db.query(`INSERT INTO public.submissions(id,title,description,category_id,status,vote_count,created_at)
      VALUES ($1,'Improve library seating','Add additional seating in the library study area.',$3,'approved',40,clock_timestamp() - interval '20 days'),
             ($2,'Pending private feedback','A pending suggestion not visible to the public.',$3,'pending',0,clock_timestamp() - interval '20 days')`, [IDEA_ID, HIDDEN_ID, CATEGORY_ID]);
    return db;
  } catch (error) { await db.close(); throw error; }
}

/** Publish using the real RPC and its current optimistic-lock version. */
export async function postProgress(db: PGlite, changes: { requestId?: string; ideaId?: string; kind?: string;
  body?: string; visibility?: string; percent?: number | null; blockedReason?: string | null;
  occurredOn?: string; notify?: boolean; expectedAt?: string } = {}) {
  const ideaId = changes.ideaId ?? IDEA_ID;
  const snapshot = await db.query<{ updated_at: string }>('SELECT updated_at::text FROM public.submissions WHERE id=$1', [ideaId]);
  const today = await db.query<{ today: string }>(`SELECT to_char(clock_timestamp() AT TIME ZONE 'Asia/Manila','YYYY-MM-DD') AS today`);
  const result = await db.query<{ result: { replayed: boolean; update: { id: string } } }>(`
    SELECT public.post_idea_update($1::uuid,$2::uuid,$3::uuid,$4::timestamptz,$5::text,$6::text,$7::text,
      $8::smallint,$9::text,$10::text,$11::date,$12::text,$13::boolean) AS result`, [
    ideaId, STAFF_ID, changes.requestId ?? crypto.randomUUID(), changes.expectedAt ?? snapshot.rows[0].updated_at,
    changes.kind ?? 'update', changes.body ?? 'The school has reviewed the work and published a progress update.',
    changes.visibility ?? 'public', changes.percent ?? null, changes.blockedReason ?? null, null,
    changes.occurredOn ?? today.rows[0].today, 'School administration', changes.notify ?? false,
  ]);
  return result.rows[0].result;
}
