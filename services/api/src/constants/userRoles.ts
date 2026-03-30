/** Stored in users.role */
export const USER_ROLE_USER = 'user' as const;
export const USER_ROLE_ADMIN = 'admin' as const;

export type UserRole = typeof USER_ROLE_USER | typeof USER_ROLE_ADMIN;
