import type { CookieSerializeOptions } from "@fastify/cookie";

export const refreshTokenCookieOptions: CookieSerializeOptions = {
  httpOnly: true,

  secure: process.env.NODE_ENV === "production",

  sameSite:
    process.env.NODE_ENV === "production"
      ? "none"
      : "lax",

  path: "/",

  maxAge: 60 * 60 * 24 * 7,
};