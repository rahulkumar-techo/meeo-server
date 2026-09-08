import type { FastifyInstance } from "fastify";
import { settingController } from "../controller/setting.controller.js";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";

/**
 * Registers System Settings & Governance routes under /api/v1/settings.
 */
export default async function settingRouter(app: FastifyInstance) {
    // ----------------------------------------------------
    // Public Brand & Customer-Facing Settings
    // ----------------------------------------------------
    app.get(
        "/public",
        {
            schema: {
                tags: ["System Settings & Governance"],
                summary: "[Public / Storefront] Get public brand settings",
                description: "Retrieves brand name, public URL, support email, default currency, and enabled feature flags.",
            },
        },
        settingController.getPublicSettings.bind(settingController),
    );

    // ----------------------------------------------------
    // Admin Full System Settings Management
    // ----------------------------------------------------
    app.get(
        "/",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.SYSTEM_MANAGE),
            ],
            schema: {
                tags: ["System Settings & Governance"],
                summary: "[Admin: system:manage] Get full system settings",
                description: "Retrieves all 3 tiers of platform configuration: Brand, Operational Toggles, Rate Limits, Feature Flags, Financial Settlement Rules, and Emergency Controls.",
                security: [{ bearerAuth: [] }],
            },
        },
        settingController.getSettings.bind(settingController),
    );

    app.put(
        "/",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.SYSTEM_MANAGE),
            ],
            schema: {
                tags: ["System Settings & Governance"],
                summary: "[Admin: system:manage] Update system settings",
                description: "Updates platform brand details, operational modes, rate limits, feature flags, or financial rules with immutable audit trail recording.",
                security: [{ bearerAuth: [] }],
            },
        },
        settingController.updateSettings.bind(settingController),
    );

    app.post(
        "/emergency-kill-switch",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.SYSTEM_MANAGE),
            ],
            schema: {
                tags: ["System Settings & Governance"],
                summary: "[Admin: system:manage] Toggle emergency kill switch",
                description: "Immediately engages or disengages the platform emergency kill switch, freezing checkouts and payments during critical outages.",
                security: [{ bearerAuth: [] }],
            },
        },
        settingController.toggleEmergencyKillSwitch.bind(settingController),
    );
}
