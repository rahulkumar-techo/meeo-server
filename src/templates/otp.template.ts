

interface OtpEmailParams {
  firstName: string;
  lastName:string;
  otpCode: string | number;
  appName?: string;
}

/**
 * Generates HTML and Plain Text email templates for OTP verification.
 */
export const generateOtpEmail = ({
  firstName,
  lastName,
  otpCode,
  appName = 'YourAppName',
}: OtpEmailParams) => {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your One-Time Password (OTP)</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f4f7f6;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
      overflow: hidden;
    }
    .header {
      background-color: #0046c0;
      padding: 24px;
      text-align: center;
      color: #ffffff;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .content {
      padding: 32px 24px;
      color: #333333;
      line-height: 1.6;
    }
    .content p {
      margin-top: 0;
      font-size: 16px;
    }
    .otp-box {
      background-color: #f0f4f8;
      border: 1px solid #dce4ec;
      border-radius: 6px;
      padding: 20px;
      text-align: center;
      margin: 24px 0;
    }
    .otp-code {
      font-size: 32px;
      font-weight: 700;
      color: #0046c0;
      letter-spacing: 4px;
      margin: 0;
    }
    .footer {
      background-color: #f9fafb;
      padding: 24px;
      text-align: center;
      color: #6b7280;
      font-size: 14px;
      border-top: 1px solid #eeeeee;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${appName}</h1>
    </div>
    <div class="content">
      <p>Hello ${firstName} ${lastName},</p>
      <p>Use the following One-Time Password (OTP) to complete your verification process. This code is valid for the next <strong>5 minutes</strong>.</p>
      
      <div class="otp-box">
        <p class="otp-code">${otpCode}</p>
      </div>
      
      <p>If you didn't request this code, you can safely ignore this email. Someone else might have typed your email address by mistake.</p>
      <p>Thanks,<br>The ${appName} Team</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `;

  const text = `
Subject: Your ${appName} Verification Code

Hello ${firstName},

Use the following One-Time Password (OTP) to complete your verification process. This code is valid for the next 10 minutes:

${otpCode}

If you didn't request this code, you can safely ignore this email. Someone else might have typed your email address by mistake.

Thanks,
The ${appName} Team

---
© ${new Date().getFullYear()} ${appName}. All rights reserved.
  `;

  return { html, text };
};