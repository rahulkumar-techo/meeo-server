import { prisma } from "@/lib/prisma.js";
import { auditLogService } from "@/modules/audit/services/auditLog.service.js";
import {
    SystemSettingsSchema,
    type SystemSettings,
    type UpdateSystemSettingsInput,
    type EmergencyKillSwitchInput,
} from "../validations/setting.validation.js";

// In-memory runtime cache for high-speed sub-millisecond retrieval
let cachedSettings: SystemSettings = SystemSettingsSchema.parse({});

export class SettingService {
    /**
     * Retrieves all system settings.
     */
    async getSettings(): Promise<SystemSettings> {
        return cachedSettings;
    }

    /**
     * Retrieves public customer-facing brand & currency settings.
     */
    async getPublicSettings() {
        const s = cachedSettings;
        return {
            platformBrandName: s.platformBrandName,
            publicDomainUrl: s.publicDomainUrl,
            supportEmail: s.supportEmail,
            defaultCurrency: s.defaultCurrency,
            timezone: s.timezone,
            maintenanceMode: s.maintenanceMode,
            readOnlyMode: s.readOnlyMode,
            disableCheckout: s.disableCheckout,
            disablePayments: s.disablePayments,
            featureFlags: s.featureFlags,
        };
    }

    /**
     * Updates system settings with schema validation, cache synchronization, and audit logging.
     */
    async updateSettings(
        input: UpdateSystemSettingsInput,
        auditContext?: { actorId?: string; ipAddress?: string; userAgent?: string },
    ): Promise<SystemSettings> {
        const previous = { ...cachedSettings };
        const merged = { ...cachedSettings, ...input };

        // Validate merged settings
        const validated = SystemSettingsSchema.parse(merged);
        cachedSettings = validated;

        // Record audit trail
        if (auditContext) {
            await auditLogService.recordLog({
                actorId: auditContext.actorId,
                action: "SYSTEM_SETTINGS_UPDATED",
                entityType: "SystemSetting",
                entityId: "global",
                oldValue: previous,
                newValue: validated,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
            });
        }

        return cachedSettings;
    }

    /**
     * Toggles emergency kill switch with broadcast message.
     */
    async toggleEmergencyKillSwitch(
        input: EmergencyKillSwitchInput,
        auditContext?: { actorId?: string; ipAddress?: string; userAgent?: string },
    ): Promise<SystemSettings> {
        const previous = { ...cachedSettings };
        cachedSettings.emergencyControls = {
            killSwitchActive: input.killSwitchActive,
            emergencyMessage: input.emergencyMessage || (input.killSwitchActive ? "Emergency maintenance in progress" : null),
            frozenAt: input.killSwitchActive ? new Date().toISOString() : null,
        };

        if (input.killSwitchActive) {
            cachedSettings.maintenanceMode = true;
            cachedSettings.disableCheckout = true;
            cachedSettings.disablePayments = true;
        }

        if (auditContext) {
            await auditLogService.recordLog({
                actorId: auditContext.actorId,
                action: input.killSwitchActive ? "EMERGENCY_KILL_SWITCH_ENGAGED" : "EMERGENCY_KILL_SWITCH_DISENGAGED",
                entityType: "SystemSetting",
                entityId: "global",
                oldValue: previous.emergencyControls,
                newValue: cachedSettings.emergencyControls,
                ipAddress: auditContext.ipAddress,
                userAgent: auditContext.userAgent,
            });
        }

        return cachedSettings;
    }

    /**
     * Evaluates whether a feature flag is enabled for a given user (supporting canary percentage rollout).
     */
    isFeatureEnabled(flagName: string, userIdentifier?: string): boolean {
        // 1. Direct boolean flag check
        if (cachedSettings.featureFlags[flagName] !== undefined) {
            if (!cachedSettings.featureFlags[flagName]) return false;
        }

        // 2. Canary percentage check
        const rolloutPercent = cachedSettings.percentageFeatureRollout[flagName];
        if (rolloutPercent !== undefined) {
            if (rolloutPercent >= 100) return true;
            if (rolloutPercent <= 0) return false;
            if (!userIdentifier) return false;

            // Deterministic hash mod 100 for consistent user bucket assignment
            let hash = 0;
            for (let i = 0; i < userIdentifier.length; i++) {
                hash = (hash << 5) - hash + userIdentifier.charCodeAt(i);
                hash |= 0;
            }
            const bucket = Math.abs(hash) % 100;
            return bucket < rolloutPercent;
        }

        return cachedSettings.featureFlags[flagName] ?? false;
    }
}

export const settingService = new SettingService();
