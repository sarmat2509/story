export interface ChildProfileLimitCalculationInput {
  planLimit: number | null;
  currentProfiles: number;
  requestedQty?: number;
}

export interface ChildProfileLimitCalculation {
  allowed: boolean;
  limit: number | null;
  remaining: number | null;
}

export class ChildProfileLimitError extends Error {
  readonly statusCode = 403;
  readonly code = 'CHILD_PROFILE_LIMIT_EXCEEDED';
  readonly featureSlug = 'child_profiles_limit';
  readonly limit: number | null;
  readonly used: number;
  readonly remaining: number | null;

  constructor(params: {
    message: string;
    limit?: number | null;
    used?: number;
    remaining?: number | null;
  }) {
    super(params.message);
    this.name = 'ChildProfileLimitError';
    this.limit = params.limit ?? null;
    this.used = params.used ?? 0;
    this.remaining = params.remaining ?? null;
  }
}

export function isChildProfileLimitError(error: unknown): error is ChildProfileLimitError {
  return error instanceof ChildProfileLimitError;
}

export function calculateChildProfileLimit(
  input: ChildProfileLimitCalculationInput
): ChildProfileLimitCalculation {
  if (input.planLimit === null) {
    return {
      allowed: true,
      limit: null,
      remaining: null,
    };
  }

  const requestedQty = input.requestedQty ?? 1;
  const limit = Math.max(0, input.planLimit);
  const remaining = Math.max(0, limit - input.currentProfiles);
  return {
    allowed: remaining >= requestedQty,
    limit,
    remaining,
  };
}

export function extractChildProfileLimit(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (value && typeof value === 'object' && 'limit' in value) {
    const raw = (value as { limit?: unknown }).limit;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return raw;
    }
  }
  return null;
}
