import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { isValidGstin, normalizeIndianState } from "../constants/indianStates.js";

export interface UpsertSellerProfileInput {
    id?: string | undefined;
    userId?: string | null | undefined;
    legalBusinessName: string;
    tradeName: string;
    gstin: string;
    stateCode: string;
    addressLine1: string;
    addressLine2?: string | null | undefined;
    city: string;
    postalCode: string;
    registrationType?: "REGULAR" | "COMPOSITION" | "UNREGISTERED" | undefined;
    status?: "ACTIVE" | "SUSPENDED" | undefined;
    isDefaultPlatformSeller?: boolean | undefined;
}

export class SellerTaxService {
    /**
     * Resolves the primary seller tax profile for first-party platform orders.
     * Auto-seeds a standard platform profile if one does not exist.
     */
    async getDefaultSellerProfile() {
        if (!prisma.sellerTaxProfile?.findFirst) {
            return {
                id: "default-platform-seller-id",
                legalBusinessName: "Meeo E-Commerce Private Limited",
                tradeName: "Meeo Store",
                gstin: "27AAACM1234F1Z5",
                stateCode: "27",
                stateName: "Maharashtra",
                addressLine1: "Plot 42, Bandra Kurla Complex",
                addressLine2: null,
                city: "Mumbai",
                postalCode: "400051",
                registrationType: "REGULAR" as const,
                status: "ACTIVE" as const,
                isDefaultPlatformSeller: true,
                isCompositionDealer: false,
                eCommerceOperatorPan: null,
                phone: null,
                email: null,
                userId: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
        }

        let seller = await prisma.sellerTaxProfile.findFirst({
            where: { isDefaultPlatformSeller: true, status: "ACTIVE" },
        });

        if (!seller) {
            // Seed authoritative default platform seller
            seller = await prisma.sellerTaxProfile.create({
                data: {
                    legalBusinessName: "Meeo E-Commerce Private Limited",
                    tradeName: "Meeo Store",
                    gstin: "27AAACM1234F1Z5",
                    stateCode: "27",
                    stateName: "Maharashtra",
                    addressLine1: "Plot 42, Bandra Kurla Complex",
                    city: "Mumbai",
                    postalCode: "400051",
                    registrationType: "REGULAR",
                    status: "ACTIVE",
                    isDefaultPlatformSeller: true,
                },
            });
        }

        return seller;
    }

    /**
     * Retrieves a seller profile by ID.
     */
    async getSellerProfileById(id: string) {
        const profile = await prisma.sellerTaxProfile.findUnique({
            where: { id },
        });
        if (!profile) {
            throw new AppError("Seller tax profile not found", 404);
        }
        return profile;
    }

    /**
     * Retrieves a seller profile by linked User ID.
     */
    async getSellerProfileByUserId(userId: string) {
        return prisma.sellerTaxProfile.findFirst({
            where: { userId },
        });
    }

    /**
     * Creates or updates a seller tax profile with statutory GSTIN validation.
     */
    async upsertSellerProfile(input: UpsertSellerProfileInput) {
        const cleanGstin = input.gstin.trim().toUpperCase();

        if (!isValidGstin(cleanGstin)) {
            throw new AppError(
                `Invalid Indian GSTIN: "${cleanGstin}". A valid GSTIN must be 15 alphanumeric characters beginning with a valid 2-digit State Code.`,
                400,
            );
        }

        const stateInfo = normalizeIndianState(input.stateCode);
        if (!stateInfo) {
            throw new AppError(`Invalid Indian State Code or Name: "${input.stateCode}"`, 400);
        }

        // Validate that GSTIN state code matches declared state code
        const gstinStatePrefix = cleanGstin.slice(0, 2);
        if (gstinStatePrefix !== stateInfo.code) {
            throw new AppError(
                `GSTIN prefix (${gstinStatePrefix}) does not match the specified State Code (${stateInfo.code} - ${stateInfo.name})`,
                400,
            );
        }

        if (input.isDefaultPlatformSeller) {
            // Demote existing default if setting new default
            await prisma.sellerTaxProfile.updateMany({
                where: { isDefaultPlatformSeller: true },
                data: { isDefaultPlatformSeller: false },
            });
        }

        if (input.id) {
            return prisma.sellerTaxProfile.update({
                where: { id: input.id },
                data: {
                    userId: input.userId ?? null,
                    legalBusinessName: input.legalBusinessName,
                    tradeName: input.tradeName,
                    gstin: cleanGstin,
                    stateCode: stateInfo.code,
                    stateName: stateInfo.name,
                    addressLine1: input.addressLine1,
                    addressLine2: input.addressLine2 ?? null,
                    city: input.city,
                    postalCode: input.postalCode,
                    registrationType: input.registrationType ?? "REGULAR",
                    status: input.status ?? "ACTIVE",
                    isDefaultPlatformSeller: input.isDefaultPlatformSeller ?? false,
                },
            });
        }

        return prisma.sellerTaxProfile.create({
            data: {
                userId: input.userId ?? null,
                legalBusinessName: input.legalBusinessName,
                tradeName: input.tradeName,
                gstin: cleanGstin,
                stateCode: stateInfo.code,
                stateName: stateInfo.name,
                addressLine1: input.addressLine1,
                addressLine2: input.addressLine2 ?? null,
                city: input.city,
                postalCode: input.postalCode,
                registrationType: input.registrationType ?? "REGULAR",
                status: input.status ?? "ACTIVE",
                isDefaultPlatformSeller: input.isDefaultPlatformSeller ?? false,
            },
        });
    }

    /**
     * Lists all registered seller tax profiles (Admin view).
     */
    async listSellerProfiles() {
        return prisma.sellerTaxProfile.findMany({
            orderBy: [{ isDefaultPlatformSeller: "desc" }, { createdAt: "desc" }],
        });
    }
}

export const sellerTaxService = new SellerTaxService();
