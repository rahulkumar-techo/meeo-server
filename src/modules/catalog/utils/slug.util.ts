/**
 * Converts a string into a clean, URL-friendly kebab-case slug.
 *
 * @param text - The raw string to slugify.
 * @returns Clean kebab-case string.
 */
export function slugify(text: string): string {
    return text
        .toLowerCase()
        .trim()
        .normalize("NFD") // Split accented characters into letter + diacritic
        .replace(/[\u0300-\u036f]/g, "") // Strip diacritics
        .replace(/[^a-z0-9\s-]/g, "") // Remove non-alphanumeric characters except spaces and hyphens
        .replace(/[\s_]+/g, "-") // Replace spaces and underscores with hyphens
        .replace(/-+/g, "-") // Collapse consecutive hyphens
        .replace(/^-+|-+$/g, ""); // Trim leading and trailing hyphens
}
