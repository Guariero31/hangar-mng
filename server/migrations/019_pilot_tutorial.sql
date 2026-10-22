alter table users add column tutorial_status text check (tutorial_status in ('completed', 'skipped'));

-- Existing pilots keep their usual sign-in flow.
update users set tutorial_status = 'skipped' where nickname is not null;
