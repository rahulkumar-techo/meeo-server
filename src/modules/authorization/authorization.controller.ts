import type { FastifyReply, FastifyRequest } from "fastify";
import { sendCreated, sendOk } from "@/common/utils/response.js";
import { authorizationService } from "./authorization.service.js";
import type { AuditContext } from "./authorization.service.js";
import { permissionAssignmentBody, roleAssignmentBody, roleBody, updateRoleBody } from "./authorization.validation.js";

type Params = { roleId: string };
// User role assignment uses a separate parameter shape to avoid mixing role and user IDs.
type UserParams = { userId: string };

/** Builds the audit metadata shared by all mutating authorization endpoints. */
const audit = (request: FastifyRequest): AuditContext => ({
    actorId: request.user.id,
    ipAddress: request.ip,
    userAgent: request.headers["user-agent"],
    requestId: request.id,
});

class AuthorizationController {
    /** Validates and creates a role, including its audit record. */
    async createRole(request: FastifyRequest, reply: FastifyReply) {
        const result = await authorizationService.createRole(roleBody.parse(request.body), audit(request));
        return sendCreated({ reply, message: "Role created successfully", data: result });
    }

    /** Returns all roles with their currently assigned permissions. */
    async listRoles(_request: FastifyRequest, reply: FastifyReply) {
        return sendOk({ reply, data: await authorizationService.listRoles() });
    }

    /** Returns one role and its assigned permissions by ID. */
    async getRole(request: FastifyRequest, reply: FastifyReply) {
        const { roleId } = request.params as Params;
        return sendOk({ reply, data: await authorizationService.getRole(roleId) });
    }

    /** Validates and updates a role, including an audit snapshot of the change. */
    async updateRole(request: FastifyRequest, reply: FastifyReply) {
        const { roleId } = request.params as Params;
        const result = await authorizationService.updateRole(roleId, updateRoleBody.parse(request.body), audit(request));
        return sendOk({ reply, message: "Role updated successfully", data: result });
    }

    /** Deletes a role unless the service identifies it as protected. */
    async deleteRole(request: FastifyRequest, reply: FastifyReply) {
        const { roleId } = request.params as Params;
        return sendOk({ reply, data: await authorizationService.deleteRole(roleId, audit(request)) });
    }

    /** Returns the developer-defined permissions available for assignment. */
    async listPermissions(_request: FastifyRequest, reply: FastifyReply) {
        return sendOk({ reply, data: await authorizationService.listPermissions() });
    }

    /** Replaces every permission link for a role in one transactional operation. */
    async replaceRolePermissions(request: FastifyRequest, reply: FastifyReply) {
        const { roleId } = request.params as Params;
        const { permissionIds } = permissionAssignmentBody.parse(request.body);
        const result = await authorizationService.replaceRolePermissions(roleId, permissionIds, audit(request));
        return sendOk({ reply, message: "Role permissions replaced successfully", data: result });
    }

    /** Replaces every role link for a user in one transactional operation. */
    async replaceUserRoles(request: FastifyRequest, reply: FastifyReply) {
        const { userId } = request.params as UserParams;
        const { roleIds } = roleAssignmentBody.parse(request.body);
        const result = await authorizationService.replaceUserRoles(userId, roleIds, audit(request));
        return sendOk({ reply, message: "User roles replaced successfully", data: result });
    }
}

export const authorizationController = new AuthorizationController();
