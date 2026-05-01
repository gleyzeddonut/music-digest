require('dotenv').config();
const express = require('express');
const path = require('path');

const { initDb, getDb } = require('./db/init');
const routes = require('./delivery/routes');
const { runDigest } = require('./processor/digest');
const config = require('./config');

const app = express();
app.use(express.json());
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

function shouldSendToday(now) {
  const frequency = getSetting('schedule_frequency', 'daily');
  if (frequency === 'daily') return true;
  if (frequency === 'weekly') {
    const target = parseInt(getSetting('schedule_week_day', '5'), 10);
    return now.getDay() === target;
  }
  if (frequency === 'monthly') {
    const target = parseInt(getSetting('schedule_month_date', '1'), 10);
    return now.getDate() === target;
  }
  return true;
}

function startServer() {
  return new Promise((resolve) => {
    initDb();

    let lastScheduledRun = null;

    setInterval(async () => {
      const sendTime = getSetting('schedule_send_time', config.SEND_TIME);
      const { hour, minute } = parseSendTime(sendTime);
      const now = new Date();
      const todayKey = now.toISOString().split('T')[0];

      if (now.getHours() === hour && now.getMinutes() === minute && lastScheduledRun !== todayKey) {
        if (!shouldSendToday(now)) return;
        lastScheduledRun = todayKey;
        console.log(`\n[${now.toISOString()}] ── Scheduled digest run starting ──`);
        try {
          const result = await runDigest({ sendEmail: true });
          if (result.skipped) {
            console.log(`[digest] Already ran today, skipped`);
          } else {
            console.log(`[digest] Done. Artists: ${result.artists?.length}, Songs: ${result.songs?.length}, Email: ${result.emailSent}`);
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
      resolve();
    });
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
