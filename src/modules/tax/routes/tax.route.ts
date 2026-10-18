import type { FastifyInstance } from "fastify";
import { taxController } from "../controller/tax.controller.js";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";

/**
 * Registers GST Calculation and Statutory Tax Management routes.
 */
export default async function taxRouter(app: FastifyInstance) {
    // ----------------------------------------------------
    // Public / Customer Endpoints
    // ----------------------------------------------------
    app.post(
        "/quote",
        {
            schema: {
                tags: ["GST & Tax Engine"],
                summary: "[Public / User] Calculate GST breakdown quote",
                description: "Computes Place of Supply (POS), verified statutory GST rates, proportional discount allocations, intra/inter-state tax splits, and shipping GST for cart or direct items.",
            },
        },
        taxController.getTaxQuote.bind(taxController),
    );

    app.get(
        "/seller-profile",
        {
            schema: {
                tags: ["GST & Tax Engine"],
                summary: "[Public / User] Get default seller tax profile",
                description: "Retrieves the primary store tax profile, legal name, trade name, GSTIN, and State Code.",
            },
        },
        taxController.getDefaultSellerProfile.bind(taxController),
    );

    app.get(
        "/invoice/:id",
        {
            preHandler: [app.authenticate],
            schema: {
                tags: ["GST & Tax Engine"],
                summary: "[User / Admin] Get Rule 46 compliant GST Tax Invoice",
                description: "Generates or retrieves statutory GST Tax Invoice matching CGST Rules 2017 with item HSNs, taxable values, CGST/SGST/IGST breakdown, and amount in words.",
                security: [{ bearerAuth: [] }],
            },
        },
        taxController.getOrderTaxInvoice.bind(taxController),
    );

    // ----------------------------------------------------
    // Admin: Tax Classifications (HSN / SAC Master)
    // ----------------------------------------------------
    app.post(
        "/admin/classifications",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.TAX_MANAGE),
            ],
            schema: {
                tags: ["GST & Tax Admin"],
                summary: "[Admin] Create HSN/SAC Tax Classification",
                security: [{ bearerAuth: [] }],
            },
        },
        taxController.createClassification.bind(taxController),
    );

    app.patch(
        "/admin/classifications/:id/status",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.TAX_APPROVE),
            ],
            schema: {
                tags: ["GST & Tax Admin"],
                summary: "[Admin] Verify or Flag HSN Tax Classification",
                security: [{ bearerAuth: [] }],
            },
        },
        taxController.updateClassificationStatus.bind(taxController),
    );

    app.get(
        "/admin/classifications",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.TAX_READ),
            ],
            schema: {
                tags: ["GST & Tax Admin"],
                summary: "[Admin] List HSN/SAC Tax Classifications",
                security: [{ bearerAuth: [] }],
            },
        },
        taxController.listClassifications.bind(taxController),
    );

    // ----------------------------------------------------
    // Admin: Statutory GST Rules (Draft / Approval / Publication)
    // ----------------------------------------------------
    app.post(
        "/admin/rules",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.TAX_MANAGE),
            ],
            schema: {
                tags: ["GST & Tax Admin"],
                summary: "[Admin] Create Draft Statutory GST Rule",
                security: [{ bearerAuth: [] }],
            },
        },
        taxController.createDraftRule.bind(taxController),
    );

    app.post(
        "/admin/rules/:id/approve",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.TAX_APPROVE),
            ],
            schema: {
                tags: ["GST & Tax Admin"],
                summary: "[Admin] Approve Draft GST Rule",
                security: [{ bearerAuth: [] }],
            },
        },
        taxController.approveRule.bind(taxController),
    );

    app.post(
        "/admin/rules/:id/publish",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.TAX_APPROVE),
            ],
            schema: {
                tags: ["GST & Tax Admin"],
                summary: "[Admin] Publish or Schedule Approved GST Rule",
                security: [{ bearerAuth: [] }],
            },
        },
        taxController.publishRule.bind(taxController),
    );

    app.post(
        "/admin/rules/:id/retire",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.TAX_MANAGE),
            ],
            schema: {
                tags: ["GST & Tax Admin"],
                summary: "[Admin] Retire Active GST Rule",
                security: [{ bearerAuth: [] }],
            },
        },
        taxController.retireRule.bind(taxController),
    );

    app.get(
        "/admin/rules",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.TAX_READ),
            ],
            schema: {
                tags: ["GST & Tax Admin"],
                summary: "[Admin] List GST Statutory Rules and Audit History",
                security: [{ bearerAuth: [] }],
            },
        },
        taxController.listGstRules.bind(taxController),
    );

    app.post(
        "/admin/seed",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.SYSTEM_MANAGE),
            ],
            schema: {
                tags: ["GST & Tax Admin"],
                summary: "[Admin] Seed Standard CBIC GST Rules & Default Platform Seller",
                security: [{ bearerAuth: [] }],
            },
        },
        taxController.seedDefaultRules.bind(taxController),
    );

    // ----------------------------------------------------
    // Admin: Seller Tax Profile Management
    // ----------------------------------------------------
    app.post(
        "/admin/sellers",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.TAX_MANAGE),
            ],
            schema: {
                tags: ["GST & Tax Admin"],
                summary: "[Admin] Create or Update Seller Tax Profile",
                security: [{ bearerAuth: [] }],
            },
        },
        taxController.upsertSellerProfile.bind(taxController),
    );

    app.get(
        "/admin/sellers",
        {
            preHandler: [
                app.authenticate,
                app.requirePermission(PERMISSIONS.TAX_READ),
            ],
            schema: {
                tags: ["GST & Tax Admin"],
                summary: "[Admin] List Seller Tax Profiles",
                security: [{ bearerAuth: [] }],
            },
        },
        taxController.listSellerProfiles.bind(taxController),
    );
}
