-- Preserve the actual acquisition price independently of future catalog changes.
alter table user_aircraft add column paid_amount int not null default 0 check (paid_amount >= 0);
alter table user_aircraft add column purchase_ledger_id bigint unique references points_ledger(id) on delete set null;
alter table user_aircraft add column acquisition_kind text not null default 'grant'
  check (acquisition_kind in ('purchase', 'grant'));

-- Purchases and their ownership row share the transaction timestamp. Never infer a
-- price from the current catalog or an older ownership cycle.
update user_aircraft ownership
   set acquisition_kind = 'purchase',
       purchase_ledger_id = (
         select ledger.id from points_ledger ledger
          where ledger.user_id = ownership.user_id and ledger.source = 'unlock'
            and ledger.amount < 0 and ledger.created_at = ownership.unlocked_at
            and (ledger.aircraft_id = ownership.aircraft_id
              or (ledger.aircraft_id is null and ledger.reason = 'Desbloqueio: ' || ownership.aircraft_id))
          order by ledger.id desc limit 1)
 where ownership.granted_by is null;
update user_aircraft ownership set paid_amount = -ledger.amount
  from points_ledger ledger where ledger.id = ownership.purchase_ledger_id;

alter table points_ledger add column refund_of bigint unique references points_ledger(id) on delete set null;

-- Keep audit events when a former administrator is deleted, without keeping its account.
alter table admin_audit_log alter column admin_id drop not null;
alter table admin_audit_log drop constraint admin_audit_log_admin_id_fkey;
alter table admin_audit_log add constraint admin_audit_log_admin_id_fkey
  foreign key (admin_id) references users(id) on delete set null;
update admin_audit_log set details = details - 'email' - 'nickname'
 where action = 'delete_user';
create index admin_audit_log_created_idx on admin_audit_log (created_at desc, id desc);
