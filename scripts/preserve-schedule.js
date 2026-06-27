#!/usr/bin/env node
/**
 * デプロイ前にリモートの schedule.json を保護する。
 * リモートの slots 数が多い、または updated が新しい場合はリモートを採用。
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const LOCAL_PATH = path.join(ROOT, 'data', 'schedule.json');
const REMOTE_URL = process.env.SCHEDULE_REMOTE_URL
  || 'https://takpz93.github.io/cmo-media-tracker/data/schedule.json';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function countSlots(json) {
  if (!json) return 0;
  return Array.isArray(json.slots) ? json.slots.length : 0;
}

function metaTime(json) {
  const t = json?.updated;
  return t ? new Date(t).getTime() : 0;
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

async function main() {
  let local = { slots: [] };
  if (fs.existsSync(LOCAL_PATH)) {
    try { local = JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf8')); }
    catch (e) { console.warn('Local schedule.json parse error:', e.message); }
  }

  let remote = null;
  try {
    remote = await fetchJson(REMOTE_URL);
  } catch (e) {
    console.log('Remote schedule.json not fetched:', e.message);
  }

  const lc = countSlots(local);
  const rc = remote ? countSlots(remote) : 0;
  const lt = metaTime(local);
  const rt = metaTime(remote);

  if (remote && (rc > lc || (rc === lc && rt > lt))) {
    writeJson(LOCAL_PATH, remote);
    console.log(`Preserved remote schedule.json (${rc} slots)`);
    return;
  }

  if (lc > 0) {
    console.log(`Keeping local schedule.json (${lc} slots)`);
    return;
  }

  if (remote && rc > 0) {
    writeJson(LOCAL_PATH, remote);
    console.log(`Restored remote schedule.json (${rc} slots)`);
    return;
  }

  console.log('No slot data to preserve');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
