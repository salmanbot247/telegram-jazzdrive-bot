const youtubeDl = require('youtube-dl-exec');
const path = require('path');
const fs = require('fs');

const DOWNLOAD_DIR = './downloads';
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

function ensureYtDlp() {
  console.log('✅ youtube-dl-exec ready!');
}

async function getVideoInfo(url) {
  const info = await youtubeDl(url, {
    dumpSingleJson: true,
    noPlaylist: true,
    noWarnings: true
  });
  return {
    title: info.title,
    duration: info.duration,
    uploader: info.uploader
  };
}

async function downloadMedia(url, quality) {
  const ts = Date.now();
  const outputPath = path.join(DOWNLOAD_DIR, `${ts}.%(ext)s`);

  let options = {
    noPlaylist: true,
    noWarnings: true,
    output: outputPath
  };

  switch (quality) {
    case '1':
      options.format = 'bestvideo[height<=360]+bestaudio/best[height<=360]';
      options.mergeOutputFormat = 'mp4';
      break;
    case '2':
      options.format = 'bestvideo[height<=720]+bestaudio/best[height<=720]';
      options.mergeOutputFormat = 'mp4';
      break;
    case '3':
      options.format = 'bestvideo[height<=1080]+bestaudio/best[height<=1080]';
      options.mergeOutputFormat = 'mp4';
      break;
    case '4':
      options.format = 'bestaudio';
      options.extractAudio = true;
      options.audioFormat = 'mp3';
      options.audioQuality = 0;
      break;
    default:
      options.format = 'best[height<=720]';
      options.mergeOutputFormat = 'mp4';
  }

  await youtubeDl(url, options);

  const files = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.startsWith(String(ts)));
  if (!files.length) throw new Error('File not found after download');

  const filePath = path.join(DOWNLOAD_DIR, files[0]);
  return {
    filePath,
    fileName: files[0],
    fileSize: fs.statSync(filePath).size
  };
}

module.exports = { ensureYtDlp, getVideoInfo, downloadMedia };
