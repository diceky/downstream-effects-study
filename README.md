# Downstream Effects Study — MVP

Minimal Vite + React frontend with Netlify Functions backend and Supabase storage for a two-flow research study (Writer / Reader).

## Stack

- Vite + React + TypeScript + React Router
- Netlify Functions (TypeScript) — all DB & AI calls go here
- Supabase (Postgres) via service role key
- `diff-match-patch` for word-diff logging

The browser never talks to Supabase directly.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor.

3. Configure environment variables (Netlify dashboard, or a local `.env` for `netlify dev`):

   ```text
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   GEMINI_API_KEY=...        # optional. Without it, ai-generate returns a stub.
   GEMINI_MODEL=gemini-2.0-flash   # optional override
   ADMIN_PASSWORD=...        # required to access /admin
   ```

   The admin page lives at `/admin` and is gated by `ADMIN_PASSWORD`. It supports creating/editing/deleting writers and readers, resetting their progress, and viewing submitted memos.

4. Install the Netlify CLI if needed:

   ```bash
   npm install -g netlify-cli
   ```

5. Run locally:

   ```bash
   netlify dev
   ```

   This serves the Vite app and the functions together at <http://localhost:8888>.

## Routes

- `/writer` — Memo Writer flow
- `/reader` — Downstream Reader flow (immediate or delayed depending on lookup)

## Seeding test data

Insert at least one `writers` row and one `readers` row (after a memo exists) to test the flows. Example:

```sql
insert into writers (writer_id, email, condition, program_overview_pdf_url, reflections_json)
values ('W001', 'writer@example.com', 'ai_mediated', 'https://example.com/overview.pdf',
        '[{"activity_number":1,"title":"Kickoff","text":"..."}]'::jsonb);

-- After a writer submits, a row appears in memos with that writer's memo_id.
-- Then assign a reader:
insert into readers (reader_id, email, assigned_memo_id, assigned_writer_id)
values ('R001', 'reader@example.com', '<memo_id from memos>', 'W001');
```

## Notes

- All participant-facing text is in Japanese.
- Writer status transitions: `not_started` → `started` (on consent) → `completed` (after survey).
- Reader routing uses `immediate_submitted_at` / `delayed_submitted_at`, not just `status`.
- Word-diff logs are buffered in the browser and flushed/uploaded on memo submit.
- AI insertions into the memo are logged as `source = "ai"` and bypass debounce.
