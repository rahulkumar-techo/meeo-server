// Email template for critical server 5xx error threshold alerts.
// Used by systemAlertConsumer when notifying administrators of abnormal server error rates.

export interface ServerAlertEmailParams {
    recipientName?: string | undefined;
    errorCount: number;
    threshold: number;
    env: string;
    method: string;
    route: string;
    errorMessage: string;
    stackSnippet?: string | undefined;
    timestamp: string;
    dashboardUrl?: string | undefined;
    cooldownMinutes?: number | undefined;
}

export function generateServerAlertEmail(params: ServerAlertEmailParams): {
    subject: string;
    html: string;
    text: string;
} {
    const {
        recipientName = "Administrator",
        errorCount,
        threshold,
        env,
        method,
        route,
        errorMessage,
        stackSnippet = "No stack trace provided",
        timestamp,
        dashboardUrl = "http://localhost:3000/system/metrics",
        cooldownMinutes = 15,
    } = params;

    const formattedEnv = env.toUpperCase();
    const subject = `🚨 [CRITICAL ALERT] ${errorCount} Server 5xx Errors/Min on ${formattedEnv}`;

    const text = [
        `CRITICAL SERVER ALERT: High 5xx Error Rate Detected`,
        `Environment: ${formattedEnv}`,
        `Error Volume (Last 60s): ${errorCount} errors (Threshold: ${threshold}/min)`,
        `Latest Route: ${method} ${route}`,
        `Error Message: ${errorMessage}`,
        `Timestamp: ${timestamp}`,
        `Observability Dashboard: ${dashboardUrl}`,
        `Cooldown: Next alert suppressed for ${cooldownMinutes} minutes.`,
    ].join("\n");

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${subject}</title>
</head>
<body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
    <div style="max-width: 620px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #fecaca; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); overflow: hidden;">
        
        <!-- Header Banner -->
        <div style="background-color: #dc2626; color: #ffffff; padding: 18px 24px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <h1 style="margin: 0; font-size: 18px; font-weight: 700; letter-spacing: -0.01em;">
                    🚨 Critical 5xx Error Rate Alert
                </h1>
                <span style="background-color: #b91c1c; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase;">
                    ${formattedEnv}
                </span>
            </div>
        </div>

        <!-- Body Content -->
        <div style="padding: 24px;">
            <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.5; color: #334155;">
                Hello <strong>${recipientName}</strong>,<br />
                The server monitoring engine detected an abnormal surge of <strong>HTTP 500 (Internal Server Error)</strong> responses breaching operational safety thresholds.
            </p>

            <!-- Metrics Table -->
            <table style="width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 13px;">
                <tbody>
                    <tr style="border-bottom: 1px solid #f1f5f9; background-color: #fef2f2;">
                        <td style="padding: 10px 12px; font-weight: 600; color: #991b1b; width: 35%;">Error Volume (60s):</td>
                        <td style="padding: 10px 12px; font-weight: 700; color: #dc2626;">
                            ${errorCount} errors (Threshold: ${threshold}/min)
                        </td>
                    </tr>
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 10px 12px; font-weight: 600; color: #64748b;">Environment:</td>
                        <td style="padding: 10px 12px; color: #0f172a; font-weight: 500;">${formattedEnv}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 10px 12px; font-weight: 600; color: #64748b;">Latest Endpoint:</td>
                        <td style="padding: 10px 12px; color: #0f172a; font-family: monospace;"><code>${method} ${route}</code></td>
                    </tr>
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 10px 12px; font-weight: 600; color: #64748b;">Error Message:</td>
                        <td style="padding: 10px 12px; color: #b91c1c; font-weight: 600;">${errorMessage}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 10px 12px; font-weight: 600; color: #64748b;">Alert Cooldown:</td>
                        <td style="padding: 10px 12px; color: #0f172a; font-weight: 600;">${cooldownMinutes} minutes</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px 12px; font-weight: 600; color: #64748b;">Triggered At:</td>
                        <td style="padding: 10px 12px; color: #475569;">${timestamp}</td>
                    </tr>
                </tbody>
            </table>

            <!-- Stack Trace Box -->
            <div style="margin-top: 16px;">
                <div style="font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 6px;">
                    Stack Trace Snippet:
                </div>
                <pre style="background-color: #0f172a; color: #f8fafc; padding: 12px; border-radius: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11px; line-height: 1.5; overflow-x: auto; margin: 0; white-space: pre-wrap;">${stackSnippet}</pre>
            </div>

            <!-- Call to Action -->
            <div style="margin-top: 24px; text-align: center;">
                <a href="${dashboardUrl}" style="display: inline-block; background-color: #0f172a; color: #ffffff; font-size: 13px; font-weight: 600; text-decoration: none; padding: 10px 22px; border-radius: 6px;">
                    Open System Observability Dashboard &rarr;
                </a>
            </div>
        </div>

        <!-- Footer -->
        <div style="background-color: #f8fafc; border-top: 1px solid #f1f5f9; padding: 14px 24px; font-size: 11px; color: #64748b; line-height: 1.5;">
            This is an automated operational notification generated by MEEO Server Observability Engine.<br />
            To prevent mailbox flooding, alert emails for this condition are throttled to once every ${cooldownMinutes} minutes.
        </div>
    </div>
</body>
</html>
    `.trim();

    return { subject, html, text };
}
