const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const DOWNLOAD_DIR = './downloads';
const COOKIES_FILE = './yt_cookies.txt';

if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

function setupCookies() {
  const cookies = process.env.YT_COOKIES;
  if (cookies) {
    fs.writeFileSync(COOKIES_FILE, cookies, 'utf8');
    console.log('✅ Cookies ready!');
  }
}

function ensureYtDlp() {
  setupCookies();
  console.log('✅ Ready!');
}

function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });
}

// iOS client - po_token ki zaroorat nahi
const CLIENTS = ['ios', 'ios_music', 'android_music', 'tv_embedded'];

async function getVideoInfo(url) {
  setupCookies();
  const cookiesArg = fs.existsSync(COOKIES_FILE) ? `--cookies "${COOKIES_FILE}"` : '';

  for (const client of CLIENTS) {
    try {
      console.log(`Trying client: ${client}`);
      const stdout = await runCommand(
        `yt-dlp --dump-json --no-playlist --no-warnings ${cookiesArg} --extractor-args "youtube:player_client=${client}" "${url}"`
      );
      const info = JSON.parse(stdout.trim());
      console.log(`✅ ${client} worked!`);
      return { title: info.title, duration: info.duration, uploader: info.uploader };
    } catch (e) {
      console.log(`${client} failed`);
      continue;
    }
  }
  throw new Error('Sab clients fail — video restricted hai');
}

async function downloadMedia(url, quality) {
  setupCookies();
  const cookiesArg = fs.existsSync(COOKIES_FILE) ? `--cookies "${COOKIES_FILE}"` : '';
  const ts = Date.now();
  const outputPath = path.join(DOWNLOAD_DIR, `${ts}.%(ext)s`);

  let formatArg = '-f "best"';
  let extraArgs = '';
  switch (quality) {
    case '1': formatArg = '-f "best[height<=360]/best"'; break;
    case '2': formatArg = '-f "best[height<=720]/best"'; break;
    case '3': formatArg = '-f "best[height<=1080]/best"'; break;
    case '4':
      formatArg = '-f "bestaudio/best"';
      extraArgs = '--extract-audio --audio-format mp3 --audio-quality 0';
      break;
  }

  for (const client of CLIENTS) {
    try {
      console.log(`Downloading with client: ${client}`);
      const cmd = `yt-dlp ${formatArg} ${extraArgs} --no-playlist --no-warnings ${cookiesArg} --extractor-args "youtube:player_client=${client}" -o "${outputPath}" "${url}"`;
      await runCommand(cmd);

      const files = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.startsWith(String(ts)));
      if (files.length) {
        const filePath = path.join(DOWNLOAD_DIR, files[0]);
        console.log(`✅ Downloaded with ${client}!`);
        return { filePath, fileName: files[0], fileSize: fs.statSync(filePath).size };
      }
    } catch (e) {
      console.log(`${client} failed: ${e.message.substring(0, 80)}`);
      continue;
    }
  }

  throw new Error('Download fail — video restricted ya unavailable hai');
}

module.exports = { ensureYtDlp, getVideoInfo, downloadMedia };
