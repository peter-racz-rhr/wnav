// Unread email over IMAP with an app password (Gmail: Google Account → Security → App passwords).
// Read-only: the inbox is opened read-only, so nothing is marked as read, moved or deleted.
import { ImapFlow } from "imapflow";

export function imapHost(address) {
  const d = String(address).split("@")[1]?.toLowerCase() || "";
  if (/^(gmail|googlemail)\.com$/.test(d)) return "imap.gmail.com";
  if (/^(outlook|hotmail|live|msn)\.[a-z.]+$/.test(d)) return "outlook.office365.com";
  if (/^(icloud|me|mac)\.com$/.test(d)) return "imap.mail.me.com";
  if (/^yahoo\./.test(d)) return "imap.mail.yahoo.com";
  if (/^(gmx)\./.test(d)) return "imap.gmx.net";
  return d ? `imap.${d}` : "";
}

// → { unread, messages: [{ uid, from, subject, date }] } newest first
export async function fetchUnread({ user, pass, host }, max = 8) {
  const client = new ImapFlow({ host: host || imapHost(user), port: 993, secure: true, auth: { user, pass }, logger: false, socketTimeout: 30e3 });
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
      const uids = (await client.search({ seen: false }, { uid: true })) || [];
      const pick = uids.slice(-max);
      const messages = [];
      if (pick.length) for await (const m of client.fetch(pick, { envelope: true, internalDate: true }, { uid: true })) {
        const f = m.envelope?.from?.[0] || {};
        messages.push({ uid: m.uid, from: f.name || f.address || "Someone", address: f.address || "", subject: m.envelope?.subject || "(no subject)", date: (m.internalDate || m.envelope?.date || new Date()).toISOString?.() || "" });
      }
      return { unread: uids.length, messages: messages.reverse() };
    } finally { lock.release(); }
  } finally { await client.logout().catch(() => {}); }
}
