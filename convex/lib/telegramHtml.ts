/**
 * HTML escape for Telegram messages (parse_mode: "HTML").
 *
 * Telegram's HTML parser only treats &, <, > as special — quotes do NOT need
 * escaping inside text content (per https://core.telegram.org/bots/api#html-style).
 * Order matters: & must be escaped FIRST or we'd double-encode "&lt;" → "&amp;lt;".
 * That double-encode IS the intended behaviour here — if a user types literal "&lt;"
 * we want it to render as the text "&lt;", not as "<".
 */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (ch) =>
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : "&gt;"
  );
}

/**
 * Send a single HTML-formatted message to the configured Telegram chat.
 * Throws on non-2xx or `{ok: false}` — let Convex log the failure (cron will
 * show up as failed in the dashboard; webhook will return 500 to Telegram and
 * be retried).
 */
export async function sendTelegramHtml(
  token: string,
  chatId: string,
  html: string,
): Promise<{ message_id: number }> {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    },
  );
  const json = (await response.json()) as { ok: boolean; result?: { message_id: number }; description?: string };
  if (!response.ok || !json.ok || !json.result) {
    // R3: log a structured breadcrumb BEFORE throw so the Convex dashboard
    // surfaces the failure even if the throw is wrapped/rethrown upstream.
    console.warn("telegram sendMessage failed", {
      status: response.status,
      description: json.description,
    });
    throw new Error(
      `Telegram sendMessage failed: ${response.status} ${JSON.stringify(json)}`,
    );
  }
  return { message_id: json.result.message_id };
}
