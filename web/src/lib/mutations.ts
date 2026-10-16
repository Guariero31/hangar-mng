/** A failed operation must never execute success-only form cleanup. */
export async function runOperation(operation: Promise<unknown>, onSuccess: () => void, onError: (error: unknown) => void): Promise<boolean> {
  try { await operation; onSuccess(); return true; }
  catch (error) { onError(error); return false; }
}
