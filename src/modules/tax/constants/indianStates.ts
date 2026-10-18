/**
 * Authoritative Indian State and Union Territory 2-digit GST State Codes
 * as specified by the Goods and Services Tax Network (GSTN) and CBIC.
 */
export interface IndianStateInfo {
    code: string;
    name: string;
    isUnionTerritory: boolean;
}

export const INDIAN_GST_STATES: Record<string, IndianStateInfo> = {
    "01": { code: "01", name: "Jammu and Kashmir", isUnionTerritory: true },
    "02": { code: "02", name: "Himachal Pradesh", isUnionTerritory: false },
    "03": { code: "03", name: "Punjab", isUnionTerritory: false },
    "04": { code: "04", name: "Chandigarh", isUnionTerritory: true },
    "05": { code: "05", name: "Uttarakhand", isUnionTerritory: false },
    "06": { code: "06", name: "Haryana", isUnionTerritory: false },
    "07": { code: "07", name: "Delhi", isUnionTerritory: true },
    "08": { code: "08", name: "Rajasthan", isUnionTerritory: false },
    "09": { code: "09", name: "Uttar Pradesh", isUnionTerritory: false },
    "10": { code: "10", name: "Bihar", isUnionTerritory: false },
    "11": { code: "11", name: "Sikkim", isUnionTerritory: false },
    "12": { code: "12", name: "Arunachal Pradesh", isUnionTerritory: false },
    "13": { code: "13", name: "Nagaland", isUnionTerritory: false },
    "14": { code: "14", name: "Manipur", isUnionTerritory: false },
    "15": { code: "15", name: "Mizoram", isUnionTerritory: false },
    "16": { code: "16", name: "Tripura", isUnionTerritory: false },
    "17": { code: "17", name: "Meghalaya", isUnionTerritory: false },
    "18": { code: "18", name: "Assam", isUnionTerritory: false },
    "19": { code: "19", name: "West Bengal", isUnionTerritory: false },
    "20": { code: "20", name: "Jharkhand", isUnionTerritory: false },
    "21": { code: "21", name: "Odisha", isUnionTerritory: false },
    "22": { code: "22", name: "Chhattisgarh", isUnionTerritory: false },
    "23": { code: "23", name: "Madhya Pradesh", isUnionTerritory: false },
    "24": { code: "24", name: "Gujarat", isUnionTerritory: false },
    "26": { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu", isUnionTerritory: true },
    "27": { code: "27", name: "Maharashtra", isUnionTerritory: false },
    "28": { code: "28", name: "Andhra Pradesh", isUnionTerritory: false },
    "29": { code: "29", name: "Karnataka", isUnionTerritory: false },
    "30": { code: "30", name: "Goa", isUnionTerritory: false },
    "31": { code: "31", name: "Lakshadweep", isUnionTerritory: true },
    "32": { code: "32", name: "Kerala", isUnionTerritory: false },
    "33": { code: "33", name: "Tamil Nadu", isUnionTerritory: false },
    "34": { code: "34", name: "Puducherry", isUnionTerritory: true },
    "35": { code: "35", name: "Andaman and Nicobar Islands", isUnionTerritory: true },
    "36": { code: "36", name: "Telangana", isUnionTerritory: false },
    "37": { code: "37", name: "Andhra Pradesh (Newly Assigned)", isUnionTerritory: false },
    "38": { code: "38", name: "Ladakh", isUnionTerritory: true },
    "97": { code: "97", name: "Other Territory", isUnionTerritory: true },
};

/**
 * Normalizes an arbitrary state name or code string to a verified 2-digit Indian GST State Code.
 */
export function normalizeIndianState(input: string | null | undefined): IndianStateInfo | null {
    if (!input) return null;
    const clean = input.trim().toLowerCase();

    // 1. Direct 2-digit code match
    if (INDIAN_GST_STATES[clean]) {
        return INDIAN_GST_STATES[clean];
    }
    if (clean.length === 2 && /^\d{2}$/.test(clean)) {
        if (INDIAN_GST_STATES[clean]) return INDIAN_GST_STATES[clean];
    }

    // 2. Name or alias matching
    for (const state of Object.values(INDIAN_GST_STATES)) {
        const normalizedName = state.name.toLowerCase();
        if (
            normalizedName === clean ||
            normalizedName.replace(/\s+/g, "") === clean.replace(/\s+/g, "") ||
            normalizedName.includes(clean) ||
            clean.includes(normalizedName)
        ) {
            return state;
        }
    }

    // Common synonyms
    if (clean === "delhi ncr" || clean === "new delhi" || clean === "nct of delhi") {
        return INDIAN_GST_STATES["07"] ?? null;
    }
    if (clean === "orissa") {
        return INDIAN_GST_STATES["21"] ?? null;
    }
    if (clean === "uttaranchal") {
        return INDIAN_GST_STATES["05"] ?? null;
    }
    if (clean === "pondicherry") {
        return INDIAN_GST_STATES["34"] ?? null;
    }

    return null;
}

/**
 * Validates a 15-character Indian Goods and Services Tax Identification Number (GSTIN).
 * Format: 2 digits (State Code) + 10 alphanumeric (PAN) + 1 entity num + 'Z' + 1 check digit.
 */
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function isValidGstin(gstin: string): boolean {
    if (!gstin || typeof gstin !== "string") return false;
    const clean = gstin.trim().toUpperCase();
    if (!GSTIN_REGEX.test(clean)) return false;

    // Check if first two digits match a recognized state code
    const stateCode = clean.slice(0, 2);
    return Boolean(INDIAN_GST_STATES[stateCode]);
}

/**
 * Extracts the 2-digit state code from a valid GSTIN.
 */
export function extractStateCodeFromGstin(gstin: string): string | null {
    if (!isValidGstin(gstin)) return null;
    return gstin.trim().slice(0, 2);
}

