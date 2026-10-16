import type { Queryable } from '../db.js';

export interface Acquisition {
  aircraft_id: string;
  paid_amount: number;
  purchase_ledger_id: string | null;
  acquisition_kind: 'purchase' | 'grant';
}

/** Refund exactly one recorded purchase, never a grant or a catalog price. */
export async function refundAcquisition(
  query: Queryable, userId: string, acquisition: Acquisition, actorId: string, reason: string,
): Promise<number> {
  if (acquisition.acquisition_kind !== 'purchase' || !acquisition.purchase_ledger_id || acquisition.paid_amount <= 0) return 0;
  const { rows } = await query.query<{ amount: number }>(
    `insert into points_ledger (user_id, amount, reason, source, created_by, aircraft_id, refund_of)
     select $1, -purchase.amount, $2, 'refund', $3, $4, purchase.id
       from points_ledger purchase
      where purchase.id = $5 and purchase.user_id = $1 and purchase.source = 'unlock'
        and -purchase.amount = $6
     on conflict (refund_of) do nothing returning amount`,
    [userId, reason, actorId, acquisition.aircraft_id, acquisition.purchase_ledger_id, acquisition.paid_amount]);
  return rows[0]?.amount ?? 0;
}
