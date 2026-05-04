type SensitiveUserField = 'passwordHash' | 'stripeCustomerId' | 'childModeExitPasscodeHash';

type UserLike = {
  passwordHash?: unknown;
  stripeCustomerId?: unknown;
  childModeExitPasscodeHash?: unknown;
  childModeExitPasscodeSetAt?: unknown;
};

export type UserResponse<T extends UserLike> = Omit<T, SensitiveUserField> & {
  childModeExitPasscodeConfigured: boolean;
};

export function toUserResponse<T extends UserLike>(user: T): UserResponse<T> {
  const {
    passwordHash: _passwordHash,
    stripeCustomerId: _stripeCustomerId,
    childModeExitPasscodeHash,
    ...safeUser
  } = user;

  return {
    ...safeUser,
    childModeExitPasscodeConfigured: Boolean(childModeExitPasscodeHash),
  } as UserResponse<T>;
}
