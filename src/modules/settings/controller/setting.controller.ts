import type { FastifyRequest, FastifyReply } from "fastify";
import { settingService } from "../services/setting.service.js";
import {
    UpdateSystemSettingsSchema,
    EmergencyKillSwitchSchema,
} from "../validations/setting.validation.js";

export class SettingController {
    /**
     * Public endpoint: Customer-facing brand name, currency, timezone, and public feature flags.
     */
    async getPublicSettings(_req: FastifyRequest, reply: FastifyReply) {
        const result = await settingService.getPublicSettings();
        return reply.status(200).send({
            success: true,
            status: "success",
            data: result,
        });
    }

    /**
     * Admin endpoint: Full system settings across all 3 tiers.
     */
    async getSettings(_req: FastifyRequest, reply: FastifyReply) {
        const result = await settingService.getSettings();
        return reply.status(200).send({
            success: true,
            status: "success",
            data: result,
        });
    }

    /**
     * Admin endpoint: Updates system settings with audit logging.
     */
    async updateSettings(req: FastifyRequest, reply: FastifyReply) {
        const input = UpdateSystemSettingsSchema.parse(req.body);
        const auditContext = {
            actorId: req.user?.id,
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"] as string,
        };
        const result = await settingService.updateSettings(input, auditContext);

        return reply.status(200).send({
            success: true,
            status: "success",
            message: "System settings updated successfully",
            data: result,
        });
    }

    /**
     * Admin endpoint: Toggles emergency kill switch.
     */
    async toggleEmergencyKillSwitch(req: FastifyRequest, reply: FastifyReply) {
        const input = EmergencyKillSwitchSchema.parse(req.body);
        const auditContext = {
            actorId: req.user?.id,
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"] as string,
        };
        const result = await settingService.toggleEmergencyKillSwitch(input, auditContext);

        return reply.status(200).send({
            success: true,
            status: "success",
            message: input.killSwitchActive
                ? "Emergency kill switch engaged: platform frozen"
                : "Emergency kill switch disengaged: platform restored",
            data: result,
        });
    }
}

export const settingController = new SettingController();
