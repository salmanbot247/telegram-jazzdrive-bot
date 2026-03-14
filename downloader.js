const youtubeDl = require('youtube-dl-exec');
const path = require('path');
const fs = require('fs');

const DOWNLOAD_DIR = './downloads';
const COOKIES_FILE = './yt_cookies.txt';

if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

// Railway variable se cookies file banao
function setupCookies() {
  const cookies = process.env.YT_COOKIES;
  if (cookies) {
    fs.writeFileSync(COOKIES_FILE, cookies, 'utf8');
    console.log('✅ YouTube cookies file ready!');
    return true;
  }
  console.log('⚠️ YT_COOKIES not found');
  return false;
}

function ensureYtDlp() {
  setupCookies();
  console.log('✅ youtube-dl-exec ready!');
}

function getBaseOptions() {
  const opts = {
    noWarnings: true,
    noPlaylist: true
  };
  if (fs.existsSync(COOKIES_FILE)) {
    opts.cookies = COOKIES_FILE;
  }
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

  let options = {
    ...getBaseOptions(),
    output: outputPath
  };

  switch (quality) {
    case '1': options.format = 'bestvideo[height<=360]+bestaudio/best[height<=360]'; options.mergeOutputFormat = 'mp4'; break;
    case '2': options.format = 'bestvideo[height<=720]+bestaudio/best[height<=720]'; options.mergeOutputFormat = 'mp4'; break;
    case '3': options.format = 'bestvideo[height<=1080]+bestaudio/best[height<=1080]'; options.mergeOutputFormat = 'mp4'; break;
    case '4': options.format = 'bestaudio'; options.extractAudio = true; options.audioFormat = 'mp3'; options.audioQuality = 0; break;
    default: options.format = 'best[height<=720]'; options.mergeOutputFormat = 'mp4';
  }

  await youtubeDl(url, options);

  const files = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.startsWith(String(ts)));
  if (!files.length) throw new Error('File not found after download');
  const filePath = path.join(DOWNLOAD_DIR, files[0]);
  return { filePath, fileName: files[0], fileSize: fs.statSync(filePath).size };
}

module.exports = { ensureYtDlp, getVideoInfo, downloadMedia };
