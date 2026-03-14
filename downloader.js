const { exec } = require('child_process');
const https = require('https');
const path = require('path');
const fs = require('fs');

const DOWNLOAD_DIR = './downloads';
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

function ensureYtDlp() {
  console.log('✅ Downloader ready!');
}

function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });
}

// ── Cobalt API se direct link lo ─────────
async function cobaltGetLink(url, quality) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      url: url,
      vQuality: quality === '1' ? '360' : quality === '2' ? '720' : quality === '3' ? '1080' : '720',
      aFormat: 'mp3',
      isAudioOnly: quality === '4',
    });

    const req = https.request({
      hostname: 'api.cobalt.tools',
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.url) resolve(json.url);
          else reject(new Error('Cobalt: ' + JSON.stringify(json)));
        } catch { reject(new Error('Cobalt parse error')); }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => reject(new Error('Cobalt timeout')));
    req.write(body);
    req.end();
  });
}

// ── getVideoInfo ──────────────────────────
async function getVideoInfo(url) {
  // Cobalt se video info nahi milti - basic info return karo
  const videoId = url.match(/(?:v=|youtu\.be\/)([^&\s]+)/)?.[1] || '';
  return {
    title: videoId ? `YouTube: ${videoId}` : 'Video',
    duration: 0,
    uploader: ''
  };
}

// ── downloadMedia ─────────────────────────
async function downloadMedia(url, quality) {
  const ts = Date.now();
  const ext = quality === '4' ? 'mp3' : 'mp4';
  const filePath = path.join(DOWNLOAD_DIR, `${ts}.${ext}`);

  // Cobalt se direct link lo
  console.log('🔗 Getting direct link from Cobalt...');
  const directUrl = await cobaltGetLink(url, quality);
  console.log('✅ Direct link mila!');

  // Method 1: aria2c (fast - 16 connections)
  console.log('🔄 Trying aria2c...');
  try {
    await runCommand(
      `aria2c -x 16 -s 16 -k 1M --out="${ts}.${ext}" --dir="${DOWNLOAD_DIR}" --user-agent="Mozilla/5.0" "${directUrl}"`
    );
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
      console.log('✅ aria2c success!');
      return { filePath, fileName: `${ts}.${ext}`, fileSize: fs.statSync(filePath).size };
    }
  } catch (e) {
    console.log('aria2c fail:', e.message.substring(0, 80));
  }

  // Method 2: curl (fallback)
  console.log('🔄 Trying curl...');
  try {
    await runCommand(
      `curl -L -o "${filePath}" -A "Mozilla/5.0" "${directUrl}"`
    );
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
      console.log('✅ curl success!');
      return { filePath, fileName: `${ts}.${ext}`, fileSize: fs.statSync(filePath).size };
    }
  } catch (e) {
    console.log('curl fail:', e.message.substring(0, 80));
  }

  throw new Error('❌ Download fail — video unavailable ya restricted hai');
}

module.exports = { ensureYtDlp, getVideoInfo, downloadMedia };
