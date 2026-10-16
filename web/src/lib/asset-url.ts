export interface ExpiringAssetUrl { url: string; expiresAt: number }

export function preserveAssetUrl(current: ExpiringAssetUrl, incoming: ExpiringAssetUrl, now = Date.now()): ExpiringAssetUrl {
  // Renew just before expiration; background polling must not reload unchanged files.
  return current.url === incoming.url || current.expiresAt > now + 60_000 ? current : incoming;
}
