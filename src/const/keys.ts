
export const Keys = {
    USER_OTP: (email: string) => `auth:otp:${email}`,
    PASSWORD_RESET_OTP: (email: string) => `auth:password-reset:${email}`,
    PHONE_OTP: (userId: string) => `auth:phone:${userId}`,
    REFRESH_TOKEN: (userId: string, jti: string) =>
        `auth:refresh:${userId}:${jti}`,

    USER_SESSIONS: (userId: string) =>
        `auth:sessions:${userId}`,
}