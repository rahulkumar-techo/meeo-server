import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_ACCESS_SECRET = "authorization-test-secret";

const { prismaMock } = vi.hoisted(() => ({
    prismaMock: {
        user: { findUnique: vi.fn() },
        userSession: { findUnique: vi.fn() },
    },
}));

vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));

import authPlugin from "../plugins/auth.plugin.js";
import { PERMISSIONS } from "../modules/authorization/permission.constants.js";
import { generateAccessToken } from "../common/utils/token.js";

describe("authorization context and permission guards", () => {
    beforeEach(() => vi.clearAllMocks());

    async function createPluginHarness() {
        const app = {
            decorateRequest: vi.fn(),
            decorate: vi.fn(),
        };
        await authPlugin(app as never, {});
        const decorators = new Map(app.decorate.mock.calls.map(([name, value]) => [name, value]));
        return { authenticate: decorators.get("authenticate")!, requireAny: decorators.get("requireAnyPermission")!, requireAll: decorators.get("requireAllPermissions")! };
    }

    it("deduplicates permissions from multiple roles during authentication", async () => {
        prismaMock.user.findUnique.mockResolvedValue({
            id: "user-001", email: "ada@example.test", status: "ACTIVE",
            roles: [
                { role: { name: "PRODUCT_MANAGER", permissions: [{ permission: { name: PERMISSIONS.PRODUCT_READ } }] } },
                { role: { name: "INVENTORY_MANAGER", permissions: [{ permission: { name: PERMISSIONS.PRODUCT_READ } }, { permission: { name: PERMISSIONS.INVENTORY_READ } }] } },
            ],
        });
        const { authenticate } = await createPluginHarness();
        const request = { headers: { authorization: `Bearer ${generateAccessToken({ userId: "user-001", email: "ada@example.test" })}` } } as { headers: Record<string, string>; user?: Record<string, unknown> };

        await authenticate(request);

        expect(request.user?.roles).toEqual(["PRODUCT_MANAGER", "INVENTORY_MANAGER"]);
        expect(request.user?.permissions).toEqual([PERMISSIONS.PRODUCT_READ, PERMISSIONS.INVENTORY_READ]);
    });

    it("allows system:manage to bypass any and all checks", async () => {
        const { requireAny, requireAll } = await createPluginHarness();
        const request = { user: { permissions: [PERMISSIONS.SYSTEM_MANAGE] } };

        await expect(requireAny(["unknown:permission"])(request)).resolves.toBeUndefined();
        await expect(requireAll(["unknown:permission", "another:permission"])(request)).resolves.toBeUndefined();
    });

    it("requires all permissions and rejects a missing permission with 403", async () => {
        const { requireAny, requireAll } = await createPluginHarness();
        const request = { user: { permissions: [PERMISSIONS.PRODUCT_READ] } };

        await expect(requireAny([PERMISSIONS.PRODUCT_READ, PERMISSIONS.INVENTORY_READ])(request)).resolves.toBeUndefined();
        await expect(requireAll([PERMISSIONS.PRODUCT_READ, PERMISSIONS.INVENTORY_READ])(request)).rejects.toMatchObject({ statusCode: 403 });
    });
});
