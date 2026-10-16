create table user_achievements (
  user_id    uuid not null references users(id) on delete cascade,
  key        text not null,
  earned_at  timestamptz not null default now(),
  primary key (user_id, key)
);
