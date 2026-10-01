import { execFileSync } from "node:child_process";

import { existsSync } from "node:fs";

// Production builds, CI, and containers do not need Git hooks
if (
    process.env.NODE_ENV !== "production" &&
    process.env.CI !== "true" &&
    process.env.HUSKY !== "0" &&
    existsSync(".git")
) {
    try {
        execFileSync("husky", { stdio: "inherit", shell: true });
    } catch {
        // Non-blocking fallback if husky binary is not in PATH
    }
}