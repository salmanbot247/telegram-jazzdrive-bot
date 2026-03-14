const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const DOWNLOAD_DIR = './downloads';
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

function downloadMedia(fileUrl) {
  return new Promise((resolve, reject) => {
    const ts = Date.now();
    const parsedUrl = new URL(fileUrl);
    
    // URL se file ka naam aur extension nikalne ki koshish
    let ext = path.extname(parsedUrl.pathname) || '.bin'; 
    let fileName = `${ts}${ext}`;
    const urlFileName = path.basename(parsedUrl.pathname);
    if (urlFileName && urlFileName.includes('.')) {
        fileName = `${ts}_${urlFileName}`;
    }

    const filePath = path.join(DOWNLOAD_DIR, fileName);
    const fileStream = fs.createWriteStream(filePath);

    const client = fileUrl.startsWith('https') ? https : http;

    client.get(fileUrl, function handleResponse(res) {
      // Agar link redirect ho raha ho toh usay follow karein
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return client.get(res.headers.location, handleResponse);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Download fail ho gaya. Status code: ${res.statusCode}`));
      }

      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        resolve({
          filePath,
          fileName,
          fileSize: fs.statSync(filePath).size
        });
      });
    }).on('error', (err) => {
      fs.unlink(filePath, () => {});
      reject(err);
    });
  });
}

module.exports = { downloadMedia };
