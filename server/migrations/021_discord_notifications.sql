create table discord_notifications (
  mission_id uuid primary key references missions(id) on delete cascade,
  copies integer not null default 1,
  state text not null default 'pending' check (state in ('pending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  message_id text,
  last_error text,
  sent_at timestamptz
);
create index discord_notifications_due on discord_notifications(next_attempt_at) where state = 'pending';
