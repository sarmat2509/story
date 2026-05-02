type SensitiveUserField = 'passwordHash' | 'stripeCustomerId';

type UserLike = {
  passwordHash?: unknown;
  stripeCustomerId?: unknown;
};

export type UserResponse<T extends UserLike> = Omit<T, SensitiveUserField>;

export function toUserResponse<T extends UserLike>(user: T): UserResponse<T> {
  const {
    passwordHash: _passwordHash,
    stripeCustomerId: _stripeCustomerId,
    ...safeUser
  } = user;

  return safeUser as UserResponse<T>;
}
