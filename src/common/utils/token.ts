import jwt from "jsonwebtoken";
import crypto from "crypto";

export interface TokenPayload {
  userId: string;
  email: string;
  sessionId?: string;
}

export interface RefreshTokenPayload extends TokenPayload {
  sessionId: string;
}

export const generateAccessToken = (
  payload: TokenPayload,
) => {
  return jwt.sign(
    payload,
    process.env.JWT_ACCESS_SECRET!,
    {
      expiresIn: "15m",
    },
  );
};

export const generateRefreshToken = (
  payload: RefreshTokenPayload,
) => {
  return jwt.sign(
    payload,
    process.env.JWT_REFRESH_SECRET!,
    {
      expiresIn: "7d",
    },
  );
};

export const verifyRefreshToken = (
  token: string,
): RefreshTokenPayload => {
  return jwt.verify(
    token,
    process.env.JWT_REFRESH_SECRET!,
  ) as RefreshTokenPayload;
};

export const verifyAccessToken = (
  token: string,
): TokenPayload => {
  return jwt.verify(
    token,
    process.env.JWT_ACCESS_SECRET!,
  ) as TokenPayload;
};

export const hashToken = (token: string) => {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
};