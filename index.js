require('dotenv').config();
const express = require('express');
const path = require('path');

const { initDb, getDb } = require('./db/init');
const routes = require('./delivery/routes');
const { runDigest } = require('./processor/digest');
const config = require('./config');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/', routes);

function getSetting(key, fallback) {
  const val = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;
  return val != null ? val : fallback;
}

function parseSendTime(timeStr) {
  const [h, m] = (timeStr || '08:00').split(':').map(Number);
  return { hour: h || 8, minute: m || 0 };
}

function shouldSendToday(now) {
  const frequency  = getSetting('schedule_frequency', 'daily');
  if (frequency === 'daily') return true;
  if (frequency === 'weekly') {
    const target = parseInt(getSetting('schedule_week_day', '5'), 10); // 0=Sun…6=Sat
    return now.getDay() === target;
  }
  if (frequency === 'monthly') {
    const target = parseInt(getSetting('schedule_month_date', '1'), 10); // 1–28
    return now.getDate() === target;
  }
  return true;
}

async function start() {
  initDb();

  // Run a check every minute — reads schedule from DB each time so changes
  // take effect without a restart
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
  });
}

start().catch(err => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
