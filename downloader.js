const youtubeDl = require('youtube-dl-exec');
const path = require('path');
const fs = require('fs');

const DOWNLOAD_DIR = './downloads';
const COOKIES_FILE = './yt_cookies.txt';

if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

function setupCookies() {
  const cookies = process.env.YT_COOKIES;
  if (cookies) {
    fs.writeFileSync(COOKIES_FILE, cookies, 'utf8');
    return true;
  }
  return false;
}

function ensureYtDlp() {
  setupCookies();
  console.log('✅ youtube-dl-exec ready!');
}

function getBaseOptions() {
  const opts = { noWarnings: true, noPlaylist: true };
  if (fs.existsSync(COOKIES_FILE)) opts.cookies = COOKIES_FILE;
  return opts;
}

async function getVideoInfo(url) {
  setupCookies();
  const info = await youtubeDl(url, {
    ...getBaseOptions(),
    dumpSingleJson: true
  });
  return { title: info.title, duration: info.duration, uploader: info.uploader };
}

async function downloadMedia(url, quality) {
  setupCookies();
  const ts = Date.now();
  const outputPath = path.join(DOWNLOAD_DIR, `${ts}.%(ext)s`);

  // Simple formats - sabse compatible
  const formats = {
    '1': 'worstvideo[ext=mp4]+bestaudio[ext=m4a]/worst[ext=mp4]/worst',
    '2': 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]',
    '3': 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best[height<=1080]',
    '4': 'bestaudio/best'
  };

  let options = {
    ...getBaseOptions(),
    output: outputPath,
    format: formats[quality] || 'best'
  };

  if (quality === '4') {
    options.extractAudio = true;
    options.audioFormat = 'mp3';
    options.audioQuality = 0;
  } else {
    options.mergeOutputFormat = 'mp4';
  }

  await youtubeDl(url, options);

  const files = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.startsWith(String(ts)));
  if (!files.length) throw new Error('File not found after download');
  const filePath = path.join(DOWNLOAD_DIR, files[0]);
  return { filePath, fileName: files[0], fileSize: fs.statSync(filePath).size };
}

module.exports = { ensureYtDlp, getVideoInfo, downloadMedia };
