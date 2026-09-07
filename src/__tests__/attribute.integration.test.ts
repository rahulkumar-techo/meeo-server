import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_ACCESS_SECRET = "attribute-test-jwt-secret";

const { attributeServiceMock, authPrismaMock } = vi.hoisted(() => ({
    attributeServiceMock: {
        listAttributes: vi.fn(),
        getAttributeById: vi.fn(),
        createAttribute: vi.fn(),
        updateAttribute: vi.fn(),
        deleteAttribute: vi.fn(),
    },
    authPrismaMock: {
        user: { findUnique: vi.fn() },
        userSession: { findUnique: vi.fn() },
    },
}));

vi.mock("../modules/catalog/services/attribute.service.js", () => ({ attributeService: attributeServiceMock }));
vi.mock("../lib/prisma.js", () => ({ prisma: authPrismaMock }));

import authPlugin from "../plugins/auth.plugin.js";
import catalogRouter from "../modules/catalog/routes/catalog.route.js";
import { PERMISSIONS } from "../modules/authorization/permission.constants.js";
import { generateAccessToken } from "../common/utils/token.js";
import { errorHandler } from "../common/errors/error-handler.js";

describe("Master Product Attribute HTTP Routes Integration Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    async function createTestApp() {
        const app = Fastify();
        await app.register(cookie);
        await app.register(authPlugin);
        await app.register(catalogRouter, { prefix: "/api/v1" });
        app.setErrorHandler(errorHandler);
        return app;
    }

    function createAuthHeaders() {
        authPrismaMock.user.findUnique.mockResolvedValue({
            id: "user-admin-1",
            email: "admin@example.test",
            status: "ACTIVE",
            roles: [
                {
                    role: {
                        name: "ADMIN",
                        permissions: [
                            { permission: { name: PERMISSIONS.ATTRIBUTE_CREATE } },
                            { permission: { name: PERMISSIONS.ATTRIBUTE_UPDATE } },
                            { permission: { name: PERMISSIONS.ATTRIBUTE_DELETE } },
                            { permission: { name: PERMISSIONS.PRODUCT_CREATE } },
                            { permission: { name: PERMISSIONS.PRODUCT_UPDATE } },
                            { permission: { name: PERMISSIONS.PRODUCT_DELETE } },
                        ],
                    },
                },
            ],
        });

        const token = generateAccessToken({ userId: "user-admin-1", email: "admin@example.test" });
        return { authorization: `Bearer ${token}` };
    }

    describe("GET /api/v1/attributes", () => {
        it("lists attributes with pagination (public)", async () => {
            const app = await createTestApp();
            attributeServiceMock.listAttributes.mockResolvedValue({
                items: [
                    {
                        id: "attr-1",
                        name: "Color",
                        values: [{ id: "val-1", value: "Red" }],
                        _count: { values: 1 },
                    },
                ],
                pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
            });

            const res = await app.inject({
                method: "GET",
                url: "/api/v1/attributes?page=1&limit=20",
            });

            expect(res.statusCode).toBe(200);
            const body = res.json();
            expect(body.success).toBe(true);
            expect(body.data.items).toHaveLength(1);
            expect(body.data.items[0].name).toBe("Color");
        });
    });

    describe("GET /api/v1/attributes/:id", () => {
        it("retrieves a single attribute by ID (public)", async () => {
            const app = await createTestApp();
            attributeServiceMock.getAttributeById.mockResolvedValue({
                id: "attr-1",
                name: "Size",
                values: [{ id: "val-1", value: "M" }, { id: "val-2", value: "L" }],
                _count: { values: 2 },
            });

            const res = await app.inject({
                method: "GET",
                url: "/api/v1/attributes/attr-1",
            });

            expect(res.statusCode).toBe(200);
            expect(res.json().data.name).toBe("Size");
        });
    });

    describe("POST /api/v1/attributes", () => {
        it("creates attribute with initial values (authenticated)", async () => {
            const app = await createTestApp();
            attributeServiceMock.createAttribute.mockResolvedValue({
                id: "attr-new",
                name: "Material",
                values: [{ id: "val-1", value: "Cotton" }, { id: "val-2", value: "Polyester" }],
            });

            const res = await app.inject({
                method: "POST",
                url: "/api/v1/attributes",
                headers: createAuthHeaders(),
                payload: {
                    name: "Material",
                    values: ["Cotton", "Polyester"],
                },
            });

            expect(res.statusCode).toBe(201);
            expect(res.json().success).toBe(true);
            expect(attributeServiceMock.createAttribute).toHaveBeenCalledWith({
                name: "Material",
                values: ["Cotton", "Polyester"],
            });
        });

        it("fails if unauthenticated", async () => {
            const app = await createTestApp();

            const res = await app.inject({
                method: "POST",
                url: "/api/v1/attributes",
                payload: { name: "Material" },
            });

            expect(res.statusCode).toBe(401);
        });
    });

    describe("PATCH /api/v1/attributes/:id", () => {
        it("updates attribute name and appends new values (authenticated)", async () => {
            const app = await createTestApp();
            attributeServiceMock.updateAttribute.mockResolvedValue({
                id: "attr-1",
                name: "Primary Color",
                values: [
                    { id: "val-1", value: "Red" },
                    { id: "val-2", value: "Purple" },
                ],
            });

            const res = await app.inject({
                method: "PATCH",
                url: "/api/v1/attributes/attr-1",
                headers: createAuthHeaders(),
                payload: {
                    name: "Primary Color",
                    values: ["Purple"],
                },
            });

            expect(res.statusCode).toBe(200);
            expect(attributeServiceMock.updateAttribute).toHaveBeenCalledWith("attr-1", {
                name: "Primary Color",
                values: ["Purple"],
            });
        });
    });

    describe("DELETE /api/v1/attributes/:id", () => {
        it("deletes attribute (authenticated)", async () => {
            const app = await createTestApp();
            attributeServiceMock.deleteAttribute.mockResolvedValue({ id: "attr-1" });

            const res = await app.inject({
                method: "DELETE",
                url: "/api/v1/attributes/attr-1",
                headers: createAuthHeaders(),
            });

            expect(res.statusCode).toBe(200);
            expect(attributeServiceMock.deleteAttribute).toHaveBeenCalledWith("attr-1");
        });
    });
});
