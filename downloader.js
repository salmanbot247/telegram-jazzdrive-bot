const { execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const DOWNLOAD_DIR = './downloads';
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

// yt-dlp dhundo ya install karo
function getYtDlpCmd() {
  const paths = [
    '/root/.local/bin/yt-dlp',
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    '/app/.local/bin/yt-dlp',
    path.join(process.env.HOME || '/root', '.local/bin/yt-dlp')
  ];
  for (const p of paths) {
    try { 
      execSync(`${p} --version`, { stdio: 'pipe' }); 
      return p; 
    } catch {}
  }
  try {
    execSync('yt-dlp --version', { stdio: 'pipe' });
    return 'yt-dlp';
  } catch {}
  return null;
}

function ensureYtDlp() {
  if (getYtDlpCmd()) {
    console.log('✅ yt-dlp found: ' + getYtDlpCmd());
    return;
  }
  
  console.log('📦 yt-dlp nahi mila, install kar raha hun...');
  
  // Method 1: pip3
  try {
    execSync('pip3 install yt-dlp --break-system-packages', { stdio: 'inherit' });
    console.log('✅ yt-dlp installed via pip3');
    return;
  } catch {}
  
  // Method 2: pip
  try {
    execSync('pip install yt-dlp --break-system-packages', { stdio: 'inherit' });
    console.log('✅ yt-dlp installed via pip');
    return;
  } catch {}

  // Method 3: curl se binary download
  try {
    execSync(
      'curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && chmod +x /usr/local/bin/yt-dlp',
      { stdio: 'inherit' }
    );
    console.log('✅ yt-dlp installed via curl');
    return;
  } catch {}

  console.error('❌ yt-dlp install nahi ho saka!');
}

async function getVideoInfo(url) {
  ensureYtDlp();
  const cmd = getYtDlpCmd() || 'yt-dlp';
  return new Promise((resolve, reject) => {
    exec(`${cmd} --dump-json --no-playlist "${url}"`, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      try {
        const info = JSON.parse(stdout);
        resolve({ title: info.title, duration: info.duration, uploader: info.uploader });
      } catch { reject(new Error('Parse error')); }
    });
  });
}

async function downloadMedia(url, quality) {
  ensureYtDlp();
  const cmd = getYtDlpCmd() || 'yt-dlp';
  return new Promise((resolve, reject) => {
    let args = '';
    switch (quality) {
      case '1': args = '-f "bestvideo[height<=360]+bestaudio/best[height<=360]" --merge-output-format mp4'; break;
      case '2': args = '-f "bestvideo[height<=720]+bestaudio/best[height<=720]" --merge-output-format mp4'; break;
      case '3': args = '-f "bestvideo[height<=1080]+bestaudio/best[height<=1080]" --merge-output-format mp4'; break;
      case '4': args = '-f bestaudio --extract-audio --audio-format mp3 --audio-quality 0'; break;
      default:  args = '-f "best[height<=720]" --merge-output-format mp4';
    }
    const ts = Date.now();
    const out = path.join(DOWNLOAD_DIR, `${ts}.%(ext)s`);
    exec(`${cmd} ${args} --no-playlist --no-warnings -o "${out}" "${url}"`,
      { timeout: 300000 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error('Download failed: ' + (stderr || err.message)));
        const files = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.startsWith(String(ts)));
        if (!files.length) return reject(new Error('File not found after download'));
        const filePath = path.join(DOWNLOAD_DIR, files[0]);
        resolve({ filePath, fileName: files[0], fileSize: fs.statSync(filePath).size });
      }
    );
  });
}

module.exports = { ensureYtDlp, getVideoInfo, downloadMedia };
