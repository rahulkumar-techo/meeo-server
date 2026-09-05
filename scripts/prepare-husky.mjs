import { execFileSync } from "node:child_process";

// Production builds do not need Git hooks, and npm may omit devDependencies there.
if (process.env.NODE_ENV !== "production") {
    execFileSync("husky", { stdio: "inherit", shell: true });
}