-- Seed data for local testing.
-- Run AFTER supabase/schema.sql.
-- Safe to re-run: uses ON CONFLICT DO NOTHING on natural keys.

-- 1 writer (AI-mediated condition, not started yet)
insert into writers (writer_id, email, condition, program_overview_pdf_url, reflections_json)
values (
  'W001',
  'writer@example.com',
  'ai_mediated',
  'https://example.com/program-overview.pdf',
  '[
    {"activity_number": 1, "title": "キックオフ", "text": "AIプロトタイピングプログラムのキックオフで学んだことのメモ。"},
    {"activity_number": 2, "title": "アイディエーション", "text": "ユースケース発想ワークで考えたアイデアのメモ。"},
    {"activity_number": 3, "title": "プロトタイプ", "text": "実際に試したプロトタイプから得た気づき。"}
  ]'::jsonb
)
on conflict (writer_id) do nothing;

-- Pre-seed a memo so readers can be assigned without waiting for the writer to submit.
insert into memos (memo_id, writer_id, condition, final_memo_text, submitted_at)
values (
  'M001',
  'W001',
  'ai_mediated',
  E'【ダミーメモ】\n\nAI Prototyping Programでは、業務に即した小さなユースケースを素早くプロトタイプ化し、検証することの重要性を学びました。\n\n主なポイント:\n- 仮説を立てて小さく試す\n- AIへの依頼内容を具体化する\n- 振り返りをチームで共有する\n\n今後の業務では、まず最小のプロトタイプを作成し、得られたフィードバックをもとに改善していきたいと考えています。',
  now()
)
on conflict (memo_id) do nothing;

-- Reader 1: fresh state — will go through immediate flow.
insert into readers (reader_id, email, assigned_memo_id, assigned_writer_id)
values ('R001', 'reader1@example.com', 'M001', 'W001')
on conflict (reader_id) do nothing;

-- Reader 2: already completed immediate session — will go straight to the delayed survey.
-- delayed_available_from is set in the past so the delayed survey is unlocked.
insert into readers (
  reader_id,
  email,
  assigned_memo_id,
  assigned_writer_id,
  status,
  consent_given,
  consent_timestamp,
  consent_version,
  immediate_started_at,
  reading_started_at,
  reading_ended_at,
  reading_duration_seconds,
  immediate_answers_json,
  immediate_submitted_at,
  delayed_available_from
)
values (
  'R002',
  'reader2@example.com',
  'M001',
  'W001',
  'started',
  true,
  now() - interval '14 days',
  'v1_mvp',
  now() - interval '14 days',
  now() - interval '14 days',
  now() - interval '14 days' + interval '4 minutes',
  240,
  '{"main_point": "テスト用ダミー回答"}'::jsonb,
  now() - interval '14 days',
  now() - interval '1 minute'
)
on conflict (reader_id) do nothing;
