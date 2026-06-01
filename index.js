require('dotenv').config();
const express = require('express');
const path = require('path');

const { initDb, getDb } = require('./db/init');
const routes = require('./delivery/routes');
const { runDigest } = require('./processor/digest');
const { verifySmtp } = require('./delivery/email');
const config = require('./config');

const app = express();
app.use(express.json());

// Dev-only CORS so Vite (:5173) can call Express (:3000)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}

// Routes BEFORE static — allows GET / guard in routes.js to redirect before
// express.static serves public/index.html
app.use('/', routes);
app.use(express.static(path.join(__dirname, 'public')));

function getSetting(key, fallback) {
  const val = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;
  return val != null ? val : fallback;
}

function parseSendTime(timeStr) {
  const [h, m] = (timeStr || '08:00').split(':').map(Number);
  return { hour: h || 8, minute: m || 0 };
}

// Wall-clock parts (hour/minute/weekday/day-of-month/date key) for the configured
// timezone, so the schedule fires at the user's intended local time regardless of
// the host machine's system timezone. Falls back to system local time if the
// configured zone string is invalid.
function zonedParts(tz) {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        weekday: 'short',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).formatToParts(new Date()).map(p => [p.type, p.value])
    );
    let hour = parseInt(parts.hour, 10);
    if (hour === 24) hour = 0; // some ICU builds emit '24' at midnight
    const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      hour,
      minute: parseInt(parts.minute, 10),
      weekday: weekdays[parts.weekday],
      dayOfMonth: parseInt(parts.day, 10),
      dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    };
  } catch {
    const now = new Date();
    return {
      hour: now.getHours(), minute: now.getMinutes(),
      weekday: now.getDay(), dayOfMonth: now.getDate(),
      dateKey: now.toISOString().split('T')[0],
    };
  }
}

function shouldSendToday(parts) {
  const frequency = getSetting('schedule_frequency', 'daily');
  if (frequency === 'weekly') {
    const target = parseInt(getSetting('schedule_week_day', '5'), 10);
    return parts.weekday === target;
  }
  if (frequency === 'monthly') {
    const target = parseInt(getSetting('schedule_month_date', '1'), 10);
    return parts.dayOfMonth === target;
  }
  return true; // daily
}

// Catch-up window: if the exact send minute is missed (system sleep, event-loop
// stalls, clock drift), still fire as long as we're within this many minutes past
// the target and haven't already run today. runDigest dedups per date+persona, so
// a late fire never double-sends.
const SCHEDULE_CATCHUP_MIN = 60;

function startServer() {
  return new Promise((resolve, reject) => {
    try { initDb(); } catch (err) { return reject(err); }

    let lastScheduledRun = null;

    setInterval(async () => {
      if (getSetting('schedule_enabled', '1') === '0') return;
      const sendTime = getSetting('schedule_send_time', config.SEND_TIME);
      const { hour, minute } = parseSendTime(sendTime);
      const parts = zonedParts(config.TIMEZONE);

      const targetMin = hour * 60 + minute;
      const nowMin = parts.hour * 60 + parts.minute;
      const withinWindow = nowMin >= targetMin && (nowMin - targetMin) <= SCHEDULE_CATCHUP_MIN;

      if (withinWindow && lastScheduledRun !== parts.dateKey) {
        if (!shouldSendToday(parts)) return;
        lastScheduledRun = parts.dateKey;
        console.log(`\n[${new Date().toISOString()}] ── Scheduled digest run starting (${config.TIMEZONE} ${parts.dateKey} ${String(parts.hour).padStart(2,'0')}:${String(parts.minute).padStart(2,'0')}) ──`);
        try {
          const { getDb } = require('./db/init');
          const personas = getDb().prepare('SELECT * FROM personas WHERE include_in_email = 1 ORDER BY is_default DESC, id').all();
          const results = [];
          for (const persona of personas) {
            try {
              const result = await runDigest({ sendEmail: false, personaId: persona.id });
              if (result.skipped) console.log(`[digest] ${persona.name}: already ran today, skipped`);
              else if (result.error) console.warn(`[digest] ${persona.name}: ${result.error}`);
              else results.push({ persona, result });
            } catch (err) {
              console.error(`[digest] ${persona.name} failed:`, err.message);
            }
          }
          if (results.length > 0) {
            const { sendCombinedDigestEmail } = require('./delivery/email');
            const sent = await sendCombinedDigestEmail(results);
            console.log(`[digest] Combined email sent: ${sent}. Personas: ${results.map(r => r.persona.name).join(', ')}`);
          }
        } catch (err) {
          console.error(`[digest] Run failed:`, err.message);
        }
      }
    }, 60_000);

    app.listen(config.PORT, () => {
      const sendTime = getSetting('schedule_send_time', config.SEND_TIME);
      console.log(`
╔══════════════════════════════════════════╗
║           MUSIC DIGEST RUNNING           ║
╠══════════════════════════════════════════╣
║  Dashboard  →  http://localhost:${config.PORT}    ║
║  Schedule   →  ${sendTime} ${config.TIMEZONE.padEnd(20)}║
╚══════════════════════════════════════════╝
`);
      verifySmtp();
      resolve();
    }).on('error', reject);
  });
}

// Export for Electron's main.js
module.exports = { startServer };

// Run directly when invoked as a plain node server
if (require.main === module) {
  startServer().catch(err => {
    console.error('Failed to start:', err.message);
    process.exit(1);
  });
}
