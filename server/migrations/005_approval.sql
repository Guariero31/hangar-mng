-- Aprovação de cadastros: novos usuários entram como 'pending' até um admin aprovar.
alter table users drop constraint if exists users_status_check;
alter table users add constraint users_status_check check (status in ('pending', 'active', 'banned', 'rejected'));
alter table users add column if not exists decided_at timestamptz;
