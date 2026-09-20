import "dotenv/config";
import { mailService } from "../common/mail/send.mail.js";

async function sendMockEmail(targetEmail: string, emailType: string = "order") {
    console.log("==========================================");
    console.log("      MEEO Mock E-Commerce Mail Dispatcher");
    console.log("==========================================");
    console.log("Recipient:", targetEmail);
    console.log("Template Type:", emailType);
    console.log("------------------------------------------");

    let subject = "";
    let html = "";
    let text = "";

    if (emailType === "welcome") {
        subject = "🎉 Welcome to MEEO Store! Your 15% Welcome Gift Inside";
        html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Welcome to MEEO</title></head>
<body style="font-family: Arial, sans-serif; background: #f8fafc; padding: 24px; margin: 0;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
    <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 32px; text-align: center; color: #ffffff;">
      <h1 style="margin: 0; font-size: 26px;">Welcome to MEEO Store! 🛍️</h1>
      <p style="margin: 8px 0 0 0; opacity: 0.9;">Your premier destination for next-generation tech & fashion.</p>
    </div>
    <div style="padding: 32px; color: #334155; line-height: 1.6;">
      <p style="font-size: 16px;">Hello <strong>Rahul</strong>,</p>
      <p>Thank you for joining our community! We are thrilled to have you with us.</p>
      
      <div style="background: #eef2ff; border: 2px dashed #6366f1; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
        <span style="font-size: 14px; color: #4338ca; text-transform: uppercase; font-weight: bold; letter-spacing: 1px;">Your Exclusive Welcome Coupon</span>
        <div style="font-size: 28px; font-weight: 800; color: #4f46e5; margin: 8px 0; letter-spacing: 2px;">WELCOME15</div>
        <p style="margin: 0; font-size: 13px; color: #64748b;">Enjoy 15% off your first order over $50. Valid for 14 days.</p>
      </div>

      <p style="margin-top: 24px;">Explore our trending categories:</p>
      <ul style="color: #475569; line-height: 1.8;">
        <li>⚡ Smartphones & Flagship Wearables</li>
        <li>💻 High-Performance Laptops & Workstations</li>
        <li>👟 Exclusive Sneakers & Streetwear</li>
      </ul>
      
      <div style="text-align: center; margin-top: 32px;">
        <a href="https://meeo.store" style="background: #4f46e5; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Start Shopping</a>
      </div>
    </div>
    <div style="background: #f1f5f9; padding: 20px; text-align: center; color: #94a3b8; font-size: 12px;">
      &copy; ${new Date().getFullYear()} MEEO Store, Inc. All rights reserved.
    </div>
  </div>
</body>
</html>
        `;
        text = `Welcome to MEEO Store! Use code WELCOME15 for 15% off your first order over $50.`;
    } else if (emailType === "promo") {
        subject = "⚡ Mega Flash Sale: Up to 50% Off Electronics!";
        html = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; background: #0f172a; padding: 24px; margin: 0; color: #f8fafc;">
  <div style="max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 12px; overflow: hidden; border: 1px solid #334155;">
    <div style="background: #e11d48; padding: 24px; text-align: center; color: #ffffff;">
      <h1 style="margin: 0; font-size: 26px;">🔥 FLASH SALE LIVE NOW 🔥</h1>
      <p style="margin: 4px 0 0 0; font-size: 14px;">Limited 24-Hour Weekend Event</p>
    </div>
    <div style="padding: 32px; line-height: 1.6;">
      <h2 style="color: #f43f5e; margin-top: 0;">Flat 50% Off Top Brands</h2>
      <p>Use promotional coupon code <strong style="color: #fb7185; background: #881337; padding: 4px 8px; border-radius: 4px;">DIWALI50</strong> at checkout to claim instant discounts on smartwatches, headphones, and gaming accessories.</p>
      
      <div style="text-align: center; margin: 32px 0;">
        <a href="https://meeo.store/deals" style="background: #e11d48; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Claim 50% Discount</a>
      </div>
    </div>
  </div>
</body>
</html>
        `;
        text = `Flash Sale is live! Use code DIWALI50 for 50% off top electronics.`;
    } else {
        // Default Order Confirmation
        subject = "📦 Order Confirmed: #ORD-20260920-88201";
        html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Order Confirmation</title></head>
<body style="font-family: Arial, sans-serif; background: #f8fafc; padding: 24px; margin: 0;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
    <div style="background: #0f172a; padding: 28px; text-align: center; color: #ffffff;">
      <div style="font-size: 36px; margin-bottom: 8px;">✅</div>
      <h1 style="margin: 0; font-size: 22px;">Thank you for your order!</h1>
      <p style="margin: 6px 0 0 0; color: #94a3b8; font-size: 14px;">Order #ORD-20260920-88201</p>
    </div>
    <div style="padding: 28px; color: #334155; line-height: 1.6;">
      <p>Hi <strong>Rahul</strong>,</p>
      <p>We've received your order and our team is preparing it for shipment. You will receive tracking updates as soon as your package is dispatched.</p>
      
      <h3 style="border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; margin-top: 24px;">Order Summary</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 12px 0;">
            <strong>Apple iPhone 15 Pro Max</strong><br>
            <span style="color: #64748b; font-size: 12px;">Natural Titanium / 256GB</span>
          </td>
          <td style="padding: 12px 0; text-align: center;">Qty: 1</td>
          <td style="padding: 12px 0; text-align: right; font-weight: bold;">$1,199.00</td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 12px 0;">
            <strong>Sony WH-1000XM5 ANC Headphones</strong><br>
            <span style="color: #64748b; font-size: 12px;">Midnight Black</span>
          </td>
          <td style="padding: 12px 0; text-align: center;">Qty: 1</td>
          <td style="padding: 12px 0; text-align: right; font-weight: bold;">$399.99</td>
        </tr>
      </table>

      <div style="margin-top: 16px; font-size: 14px; text-align: right;">
        <p style="margin: 4px 0;">Subtotal: <strong>$1,598.99</strong></p>
        <p style="margin: 4px 0; color: #16a34a;">Promotion (DIWALI50): <strong>-$200.00</strong></p>
        <p style="margin: 4px 0;">Shipping: <strong>FREE</strong></p>
        <p style="margin: 8px 0; font-size: 18px; color: #0f172a;">Total Paid: <strong>$1,398.99</strong></p>
      </div>

      <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin-top: 24px; font-size: 13px;">
        <strong>Delivery Address:</strong><br>
        Rahul Kumar<br>
        124 Cyber City, DLF Phase 2<br>
        Gurugram, Haryana - 122002<br>
        Estimated Delivery: <strong>September 22 - 24, 2026</strong>
      </div>
    </div>
    <div style="background: #f1f5f9; padding: 16px; text-align: center; color: #94a3b8; font-size: 12px;">
      Need help with this order? Reply to this email or visit our Help Center.
    </div>
  </div>
</body>
</html>
        `;
        text = `Thank you for your order #ORD-20260920-88201! Total paid: $1,398.99.`;
    }

    try {
        await mailService.sendMail({
            to: targetEmail,
            subject,
            html,
            text,
        });
        console.log("\n🎉 SUCCESS: Mock email dispatched via Brevo API!");
    } catch (err: any) {
        console.error("❌ Error sending mock email:", err.message);
    }
}

const target = process.argv[2] || "rahulkumar9142684664@gmail.com";
const type = process.argv[3] || "order";
sendMockEmail(target, type);
