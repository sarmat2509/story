export type QuotaReservationReleaseReason =
  | 'queue_enqueue_failed'
  | 'generation_failed'
  | 'instant_setup_failed'
  | 'audio_generation_failed';

export function getQuotaReservationReleaseQuantity(netReserved: number): -1 | 0 {
  return netReserved > 0 ? -1 : 0;
}

export function truncateQuotaReleaseErrorMessage(errorMessage?: string): string | undefined {
  const trimmed = errorMessage?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.length > 500 ? `${trimmed.slice(0, 497)}...` : trimmed;
}
