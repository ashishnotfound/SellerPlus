/**
 * Notification Dispatch Services
 * Handles message delivery to Discord webhooks, Telegram bots, and email (Resend).
 */

export interface NotificationPayload {
  email?: string;
  discordUrl?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  title: string;
  message: string;
}

/**
 * Deliver a notification to configured targets.
 */
export async function sendNotification(payload: NotificationPayload): Promise<{
  discord?: { success: boolean; error?: string };
  telegram?: { success: boolean; error?: string };
  email?: { success: boolean; error?: string };
}> {
  const results: any = {};

  // 1. Send to Discord Webhook
  if (payload.discordUrl && payload.discordUrl.startsWith("http")) {
    try {
      const res = await fetch(payload.discordUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title: payload.title,
            description: payload.message,
            color: 3066993, // Green theme (#2ecc71)
            timestamp: new Date().toISOString(),
            footer: { text: "SellerPlus OS Notifications" }
          }]
        })
      });
      if (res.ok) {
        results.discord = { success: true };
      } else {
        const text = await res.text();
        results.discord = { success: false, error: `Discord HTTP ${res.status}: ${text}` };
      }
    } catch (e: any) {
      results.discord = { success: false, error: e.message };
    }
  }

  // 2. Send to Telegram
  if (payload.telegramBotToken && payload.telegramChatId) {
    try {
      const url = `https://api.telegram.org/bot${payload.telegramBotToken}/sendMessage`;
      const escapedMessage = payload.message
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\*(.*?)\*/g, "<b>$1</b>");
      const formattedText = `<b>${payload.title}</b>\n\n${escapedMessage}`;
      
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: payload.telegramChatId,
          text: formattedText,
          parse_mode: "HTML"
        })
      });
      
      if (res.ok) {
        results.telegram = { success: true };
      } else {
        const data = await res.json();
        results.telegram = { success: false, error: data.description || `Telegram HTTP ${res.status}` };
      }
    } catch (e: any) {
      results.telegram = { success: false, error: e.message };
    }
  }

  // 3. Send to Email via Resend
  if (payload.email) {
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: "SellerPlus OS <alerts@sellerplus.in>",
            to: [payload.email],
            subject: payload.title,
            html: `<div style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.5;">
              <h2 style="color: #00c48c; margin-top: 0;">${payload.title}</h2>
              <p style="white-space: pre-line;">${payload.message.replace(/\*(.*?)\*/g, "<strong>$1</strong>")}</p>
              <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
              <p style="font-size: 11px; color: #999;">This alert was generated automatically by SellerPlus OS.</p>
            </div>`
          })
        });
        
        if (res.ok) {
          results.email = { success: true };
        } else {
          const text = await res.text();
          results.email = { success: false, error: `Resend HTTP ${res.status}: ${text}` };
        }
      } catch (e: any) {
        results.email = { success: false, error: e.message };
      }
    } else {
      console.log(`[Notification MOCK Email] To: ${payload.email} | Title: ${payload.title} | Message: ${payload.message}`);
      results.email = { success: true, error: "Mock delivery (No RESEND_API_KEY set)" };
    }
  }

  return results;
}
