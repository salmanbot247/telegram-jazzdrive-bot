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

function getCookiesArg() {
  return fs.existsSync(COOKIES_FILE) ? `--cookies "${COOKIES_FILE}"` : '';
}

// ── Method 1: yt-dlp ─────────────────────
async function downloadWithYtDlp(url, quality, outputPath) {
  const cookiesArg = getCookiesArg();
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

  const cmd = `yt-dlp ${formatArg} ${extraArgs} --no-playlist --no-warnings ${cookiesArg} -o "${outputPath}" "${url}"`;
  console.log('Trying yt-dlp...');
  await runCommand(cmd);
}

// ── Method 2: pytube (Python) ─────────────
async function downloadWithPytube(url, quality, outputPath) {
  console.log('Trying pytube...');
  const ext = quality === '4' ? 'mp3' : 'mp4';
  const actualOutput = outputPath.replace('%(ext)s', ext);
  
  const pyScript = `
import sys
from pytubefix import YouTube
from pytubefix.cli import on_progress

yt = YouTube('${url}', on_progress_callback=on_progress)

if '${quality}' == '4':
    stream = yt.streams.filter(only_audio=True).first()
else:
    res_map = {'1': '360p', '2': '720p', '3': '1080p'}
    res = res_map.get('${quality}', '720p')
    stream = yt.streams.filter(res=res, file_extension='mp4').first()
    if not stream:
        stream = yt.streams.filter(progressive=True, file_extension='mp4').order_by('resolution').last()

stream.download(filename='${actualOutput}')
print('Downloaded:', '${actualOutput}')
`;

  const pyFile = `/tmp/dl_${Date.now()}.py`;
  fs.writeFileSync(pyFile, pyScript);
  
  try {
    await runCommand(`python3 ${pyFile}`);
  } finally {
    fs.unlinkSync(pyFile);
  }
  
  return actualOutput;
}

// ── getVideoInfo ──────────────────────────
async function getVideoInfo(url) {
  setupCookies();
  
  // Try yt-dlp first
  try {
    const cookiesArg = getCookiesArg();
    const stdout = await runCommand(
      `yt-dlp --dump-json --no-playlist --no-warnings ${cookiesArg} "${url}"`
    );
    const info = JSON.parse(stdout.trim());
    return { title: info.title, duration: info.duration, uploader: info.uploader };
  } catch (e) {
    console.log('yt-dlp info failed, trying pytube...');
  }

  // Fallback: pytube
  const pyScript = `
import json
from pytubefix import YouTube
yt = YouTube('${url}')
print(json.dumps({'title': yt.title, 'duration': yt.length, 'uploader': yt.author}))
`;
  const pyFile = `/tmp/info_${Date.now()}.py`;
  fs.writeFileSync(pyFile, pyScript);
  try {
    const stdout = await runCommand(`python3 ${pyFile}`);
    return JSON.parse(stdout.trim());
  } finally {
    fs.unlinkSync(pyFile);
  }
}

// ── downloadMedia ─────────────────────────
async function downloadMedia(url, quality) {
  setupCookies();
  const ts = Date.now();
  const outputPath = path.join(DOWNLOAD_DIR, `${ts}.%(ext)s`);

  // Method 1: yt-dlp
  try {
    await downloadWithYtDlp(url, quality, outputPath);
    const files = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.startsWith(String(ts)));
    if (files.length) {
      const filePath = path.join(DOWNLOAD_DIR, files[0]);
      console.log('✅ yt-dlp success!');
      return { filePath, fileName: files[0], fileSize: fs.statSync(filePath).size };
    }
  } catch (e) {
    console.log('yt-dlp failed:', e.message.substring(0, 100));
  }

  // Method 2: pytube
  try {
    const ext = quality === '4' ? 'mp3' : 'mp4';
    const actualOutput = path.join(DOWNLOAD_DIR, `${ts}.${ext}`);
    await downloadWithPytube(url, quality, actualOutput);
    
    const files = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.startsWith(String(ts)));
    if (files.length) {
      const filePath = path.join(DOWNLOAD_DIR, files[0]);
      console.log('✅ pytube success!');
      return { filePath, fileName: files[0], fileSize: fs.statSync(filePath).size };
    }
  } catch (e) {
    console.log('pytube failed:', e.message.substring(0, 100));
  }

  throw new Error('Dono methods fail ho gaye — video available nahi ya restricted hai');
}

module.exports = { ensureYtDlp, getVideoInfo, downloadMedia };
