import ImageKit, { toFile } from "@imagekit/nodejs";
import "dotenv/config.js";
import crypto from "node:crypto";
import { AppError } from "../common/errors/app-error.js";

/**
 * ImageKit instance initialized with credentials from environment variables.
 */
const privateKey = process.env.IMAGEKIT_PRIVATE_KEY || "";
const publicKey = process.env.IMAGEKIT_API_KEY || process.env.IMAGEKIT_PUBLIC_KEY || "";
const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT || "";

export const imagekit = new ImageKit({
    privateKey: privateKey,
});

export interface UploadOptions {
    file: Buffer | string;
    fileName: string;
    folder?: string;
    tags?: string[];
    useUniqueFileName?: boolean;
    mimeType?: string;
}

export interface UploadResult {
    fileId: string;
    url: string;
    name: string;
    size?: number;
    width?: number;
    height?: number;
    thumbnailUrl?: string;
}

/**
 * Uploads a file (Buffer, base64 string, or remote URL) to ImageKit.
 */
export async function uploadToImageKit(options: UploadOptions): Promise<UploadResult> {
    if (!privateKey) {
        throw new AppError("ImageKit private key is not configured on the server", 500);
    }

    try {
        let uploadPayload: any;

        if (Buffer.isBuffer(options.file)) {
            uploadPayload = await toFile(
                options.file,
                options.fileName,
                ...(options.mimeType ? [{ type: options.mimeType }] : [])
            );
        } else {
            uploadPayload = options.file;
        }

        const response = await imagekit.files.upload({
            file: uploadPayload,
            fileName: options.fileName,
            ...(options.folder !== undefined && { folder: options.folder }),
            ...(options.tags !== undefined && { tags: options.tags }),
            ...(options.useUniqueFileName !== undefined && { useUniqueFileName: options.useUniqueFileName }),
        });

        return {
            fileId: response.fileId ?? "",
            url: response.url ?? "",
            name: response.name ?? options.fileName,
            ...(response.size !== undefined && { size: response.size }),
            ...(response.width !== undefined && { width: response.width }),
            ...(response.height !== undefined && { height: response.height }),
            ...(response.thumbnailUrl !== undefined && { thumbnailUrl: response.thumbnailUrl }),
        };
    } catch (error: any) {
        const message = error?.message || "Failed to upload image to ImageKit";
        throw new AppError(`ImageKit upload failed: ${message}`, error?.statusCode || 500);
    }
}

/**
 * Deletes a file from ImageKit by its fileId.
 */
export async function deleteFromImageKit(fileId: string): Promise<void> {
    if (!privateKey || !fileId) {
        return;
    }

    try {
        await imagekit.files.delete(fileId);
    } catch (error: any) {
        // Log warning or rethrow if necessary; usually safe to ignore if file already missing (404)
        if (error?.status !== 404 && error?.statusCode !== 404) {
            console.warn(`Failed to delete ImageKit asset ${fileId}:`, error?.message);
        }
    }
}

/**
 * Generates client-side authentication parameters (token, expire, signature) for direct browser uploads.
 */
export function getImageKitAuthParams(expireInSeconds = 1800): {
    token: string;
    expire: number;
    signature: string;
    publicKey: string;
    urlEndpoint: string;
} {
    if (!privateKey) {
        throw new AppError("ImageKit private key is not configured on the server", 500);
    }

    const token = crypto.randomUUID();
    const expire = Math.floor(Date.now() / 1000) + expireInSeconds;
    const signature = crypto
        .createHmac("sha1", privateKey)
        .update(token + expire)
        .digest("hex");

    return {
        token,
        expire,
        signature,
        publicKey,
        urlEndpoint,
    };
}