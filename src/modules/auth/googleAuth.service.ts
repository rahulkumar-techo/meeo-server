import { AppError } from "@/common/errors/app-error.js";
import { OAuth2Client } from "google-auth-library";
import type { TokenPayload } from "google-auth-library";

const googleClient = new OAuth2Client();

function getGoogleAudiences(): string[] {
    return [
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_WEB_CLIENT_ID,
        process.env.GOOGLE_IOS_CLIENT_ID,
        process.env.GOOGLE_ANDROID_CLIENT_ID,
    ].filter(Boolean) as string[];
}

export interface VerifiedGoogleUser {
    googleId: string;       // sub claim (unique permanent ID)
    email: string;
    emailVerified: boolean;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
}

export async function verifyGoogleIdToken(idToken: string): Promise<VerifiedGoogleUser> {
    if (!idToken || typeof idToken !== "string") {
        throw new AppError("Google ID token is required", 400);
    }

    const audiences = getGoogleAudiences();

    try {
        const ticket = await googleClient.verifyIdToken({
            idToken,
            ...(audiences.length > 0 ? { audience: audiences.length === 1 ? audiences[0]! : audiences } : {}),
        });

        const payload: TokenPayload | undefined = ticket.getPayload();

        if (!payload) {
            throw new AppError("Invalid Google token payload", 401);
        }

        // 🟢 Critical security check: Ensure Google verified the email
        if (!payload.email || !payload.email_verified) {
            throw new AppError("Google account email is unverified or missing", 400);
        }

        return {
            googleId: payload.sub,
            email: payload.email.toLowerCase().trim(),
            emailVerified: Boolean(payload.email_verified),
            firstName: payload.given_name?.trim() ?? null,
            lastName: payload.family_name?.trim() ?? null,
            avatarUrl: payload.picture ?? null,
        };
    } catch (error: any) {
        if (error instanceof AppError) throw error;
        throw new AppError(`Google authentication failed: ${error.message}`, 401);
    }
}
