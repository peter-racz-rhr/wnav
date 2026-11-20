// Calendar from a private iCal (.ics) link (Google Calendar: Settings → your calendar →
// "Secret address in iCal format"; Outlook: Publish calendar → ICS). No sign-in needed.
// Parses events, expands simple repeating meetings, and finds a "Join" link.

const JOIN = /(https:\/\/(?:meet\.google\.com\/[a-z0-9-]+|[\w.-]*zoom\.us\/j\/[^\s"<>\\]+|teams\.microsoft\.com\/l\/meetup-join\/[^\s"<>\\]+|teams\.live\.com\/meet\/[^\s"<>\\]+|[\w.-]*webex\.com\/[^\s"<>\\]+))/i;

function unfold(text) { return text.replace(/\r?\n[ \t]/g, ""); }
function unescape(v) { return String(v || "").replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim(); }

// "20261120T143000Z" | "20261120T143000" (local) | "20261120" (all day)
export function parseDate(value, params = "") {
  const m = String(value).match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", s = "0", z] = m;
  const allDay = !m[4] || /VALUE=DATE(?!-)/.test(params);
  const date = z ? new Date(Date.UTC(+y, mo - 1, +d, +h, +mi, +s)) : new Date(+y, mo - 1, +d, +h, +mi, +s);
  return { date, allDay };
}

export function parseICS(text) {
  const events = [];
  let cur = null;
  for (const line of unfold(text).split(/\r?\n/)) {
    if (line === "BEGIN:VEVENT") { cur = { exdates: [] }; continue; }
    if (line === "END:VEVENT") { if (cur?.start) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const i = line.indexOf(":"); if (i < 0) continue;
    const head = line.slice(0, i), value = line.slice(i + 1);
    const [name, ...params] = head.split(";");
    const p = params.join(";");
    switch (name) {
      case "SUMMARY": cur.title = unescape(value); break;
      case "LOCATION": cur.location = unescape(value); break;
      case "DESCRIPTION": cur.description = unescape(value); break;
      case "URL": cur.url = unescape(value); break;
      case "UID": cur.uid = value; break;
      case "STATUS": cur.status = value; break;
      case "RECURRENCE-ID": cur.recurrenceId = parseDate(value, p)?.date; break;
      case "DTSTART": { const d = parseDate(value, p); if (d) { cur.start = d.date; cur.allDay = d.allDay; } break; }
      case "DTEND": { const d = parseDate(value, p); if (d) cur.end = d.date; break; }
      case "RRULE": cur.rrule = Object.fromEntries(value.split(";").map((kv) => kv.split("="))); break;
      case "EXDATE": for (const v of value.split(",")) { const d = parseDate(v, p); if (d) cur.exdates.push(d.date.getTime()); } break;
      default: if (/^X-GOOGLE-CONFERENCE$/.test(name)) cur.conference = unescape(value);
    }
  }
  return events;
}

const DAY = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
// Occurrences of one event that overlap [from, to). Handles DAILY / WEEKLY (BYDAY) / MONTHLY / YEARLY
// with INTERVAL, COUNT, UNTIL and EXDATE: the patterns almost all meetings use.
function occurrences(ev, from, to) {
  const dur = (ev.end ? ev.end - ev.start : ev.allDay ? 864e5 : 30 * 60e3);
  if (!ev.rrule) return ev.start < to && ev.start.getTime() + dur > from ? [ev.start] : [];
  const r = ev.rrule, interval = +(r.INTERVAL || 1), until = r.UNTIL ? parseDate(r.UNTIL)?.date : null, count = r.COUNT ? +r.COUNT : Infinity;
  const out = [];
  let n = 0;
  const push = (d) => {
    n++;
    if (n > count || (until && d > until)) return false;
    if (!ev.exdates.includes(d.getTime()) && d < to && d.getTime() + dur > from) out.push(new Date(d));
    return d < to;
  };
  const start = new Date(ev.start);
  if (r.FREQ === "WEEKLY") {
    const days = r.BYDAY ? r.BYDAY.split(",").map((x) => DAY[x.slice(-2)]).sort() : [start.getDay()];
    const week0 = new Date(start); week0.setDate(start.getDate() - start.getDay());
    for (let w = 0; w < 1500; w += interval) {
      for (const dd of days) {
        const d = new Date(week0); d.setDate(week0.getDate() + w * 7 + dd);
        d.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), 0);
        if (d < start) continue;
        if (!push(d)) return out;
      }
    }
  } else {
    const step = { DAILY: (d, k) => d.setDate(d.getDate() + k), MONTHLY: (d, k) => d.setMonth(d.getMonth() + k), YEARLY: (d, k) => d.setFullYear(d.getFullYear() + k) }[r.FREQ];
    if (!step) return [];
    for (let i = 0, d = new Date(start); i < 5000; i++, step(d, interval)) if (!push(d)) return out;
  }
  return out;
}

// Events between now-ish and the end of tomorrow, sorted, with a join link when there is one.
export function upcoming(events, now = new Date(), days = 2) {
  const from = new Date(now); from.setHours(0, 0, 0, 0);
  const to = new Date(from); to.setDate(from.getDate() + days);
  const overrides = new Map(events.filter((e) => e.recurrenceId).map((e) => [e.uid + "|" + e.recurrenceId.getTime(), e]));
  const list = [];
  for (const ev of events) {
    if (ev.recurrenceId || ev.status === "CANCELLED") continue;
    for (const s of occurrences(ev, from, to)) {
      const o = overrides.get(ev.uid + "|" + s.getTime());
      const e = o || ev;
      if (e.status === "CANCELLED") continue;
      const start = o ? o.start : s, end = new Date(start.getTime() + ((e.end || ev.end) ? ((e.end || ev.end) - (e.start || ev.start)) : 30 * 60e3));
      const blob = [e.url, e.location, e.description, e.conference].filter(Boolean).join("\n");
      list.push({ title: e.title || "(no title)", start: start.toISOString(), end: end.toISOString(), allDay: !!ev.allDay, location: e.location || "", join: blob.match(JOIN)?.[1] || "" });
    }
  }
  return list.sort((a, b) => a.start.localeCompare(b.start));
}

export async function fetchCalendar(url) {
  const u = String(url || "").trim().replace(/^webcal:/i, "https:");
  if (!/^https:\/\//i.test(u)) throw new Error("Paste the calendar's https iCal link.");
  const res = await fetch(u, { headers: { "User-Agent": "Jarvis-desktop" } });
  if (!res.ok) throw new Error(`Calendar link answered ${res.status}`);
  return upcoming(parseICS(await res.text()));
}
