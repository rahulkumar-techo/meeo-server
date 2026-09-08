import type { CookieSerializeOptions } from "@fastify/cookie";

// Cross-origin AJAX/fetch requests (e.g. localhost:3000 to localhost:5000 or to Render)
// require SameSite: "none" and Secure: true. Modern browsers treat localhost as a secure origin.
const isSecure = true;

export const refreshTokenCookieOptions: CookieSerializeOptions = {
  httpOnly: true,
  secure: isSecure,
  sameSite: "none",
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};

export const accessTokenCookieOptions: CookieSerializeOptions = {
  httpOnly: true,
  secure: isSecure,
  sameSite: "none",
  path: "/",
  maxAge: 60 * 15, // 15 minutes access token lifetime
};
