import { getOpsRuntimeRepository } from '../repositories';

export type OpsRuntimeMode = 'normal' | 'draining' | 'maintenance';

export interface OpsRuntimeStatus {
  mode: OpsRuntimeMode;
  active: boolean;
  message: string | null;
  startsAt: string | null;
  endsAt: string | null;
  retryAfterSeconds: number | null;
  updatedAt: string;
}

const DEFAULT_MAINTENANCE_MESSAGE =
  'WonderTales is being updated. Generation will be available again shortly.';

function isActiveWindow(startsAt: Date | null, endsAt: Date | null, now: Date): boolean {
  if (startsAt && startsAt > now) return false;
  if (endsAt && endsAt <= now) return false;
  return true;
}

function retryAfterSeconds(endsAt: Date | null, now: Date): number | null {
  if (!endsAt) return 300;
  return Math.max(30, Math.ceil((endsAt.getTime() - now.getTime()) / 1000));
}

export async function getOpsRuntimeStatus(now = new Date()): Promise<OpsRuntimeStatus> {
  const state = await getOpsRuntimeRepository().getGlobalState();
  const mode = (state.mode === 'draining' || state.mode === 'maintenance' ? state.mode : 'normal') as OpsRuntimeMode;
  const active = mode !== 'normal' && isActiveWindow(state.startsAt, state.endsAt, now);

  return {
    mode,
    active,
    message: state.message || (active ? DEFAULT_MAINTENANCE_MESSAGE : null),
    startsAt: state.startsAt ? state.startsAt.toISOString() : null,
    endsAt: state.endsAt ? state.endsAt.toISOString() : null,
    retryAfterSeconds: active ? retryAfterSeconds(state.endsAt, now) : null,
    updatedAt: state.updatedAt.toISOString(),
  };
}

export async function setOpsRuntimeMode(input: {
  mode: OpsRuntimeMode;
  message?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  updatedByUserId?: string | null;
}): Promise<OpsRuntimeStatus> {
  await getOpsRuntimeRepository().updateGlobalState(input);
  return getOpsRuntimeStatus();
}

export class MaintenanceModeError extends Error {
  readonly statusCode = 503;
  readonly code = 'MAINTENANCE_MODE';

  constructor(readonly runtimeStatus: OpsRuntimeStatus) {
    super(runtimeStatus.message || DEFAULT_MAINTENANCE_MESSAGE);
    this.name = 'MaintenanceModeError';
  }
}

export async function assertGenerationAllowedByOpsMode(): Promise<void> {
  const status = await getOpsRuntimeStatus();
  if (status.active && status.mode !== 'normal') {
    throw new MaintenanceModeError(status);
  }
}
