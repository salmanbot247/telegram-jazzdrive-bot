const { chromium } = require('playwright');
const fs = require('fs');

const COOKIES_FILE = './jazz_cookies.json';
const JAZZDRIVE_URL = 'https://cloud.jazzdrive.com.pk';

let browser = null;
let context = null;
let page = null;

async function launchBrowser() {
  if (browser) return;
  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  if (fs.existsSync(COOKIES_FILE)) {
    context = await browser.newContext({ storageState: COOKIES_FILE });
  } else {
    context = await browser.newContext();
  }
  page = await context.newPage();
}

// 📸 Naya Function: Telegram par direct screenshot bhejne ke liye
async function sendScreen(bot, chatId, caption) {
  if (!bot || !chatId || !page) return;
  try {
    const buffer = await page.screenshot();
    await bot.sendPhoto(chatId, buffer, { caption: caption });
  } catch (e) {
    console.log("Screenshot error:", e.message);
  }
}

async function requestOTP(jazzPhone, bot, chatId) {
  try {
    await launchBrowser();
    await page.goto(`${JAZZDRIVE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await sendScreen(bot, chatId, "📸 1. Login page open ho gayi");

    await page.waitForSelector('input[type="tel"]', { timeout: 15000 });
    await page.fill('input[type="tel"]', jazzPhone.trim());
    await sendScreen(bot, chatId, "📸 2. Number enter kar diya");

    await page.click('#signinbtn');
    console.log('⏳ Waiting 6s for OTP screen...');
    await page.waitForTimeout(6000);
    await sendScreen(bot, chatId, "📸 3. OTP screen (Agar issue ho to yahan dikhega)");

    return { success: true };
  } catch (err) {
    await sendScreen(bot, chatId, "❌ Error yahan aaya!");
    return { success: false, error: err.message };
  }
}

async function verifyOTP(jazzPhone, otp, bot, chatId) {
  try {
    let done = false;
    try {
      await page.fill('#otp', otp.trim(), { timeout: 2000 });
      done = true;
    } catch {}

    if (!done) {
      try {
        await page.evaluate(`document.getElementById("otp").value = "${otp.trim()}"`);
        done = true;
      } catch {}
    }

    if (!done) {
      for (const digit of otp.trim()) {
        await page.keyboard.press(digit);
        await page.waitForTimeout(100);
      }
    }

    await page.waitForTimeout(1000);
    await sendScreen(bot, chatId, "📸 4. OTP type kar diya");

    try {
      await page.click('#signinbtn', { timeout: 5000 });
    } catch {
      try { await page.click('button:has-text("Login")', { timeout: 3000 }); } catch {}
    }

    console.log('⏳ Loading dashboard (12s)...');
    await page.waitForTimeout(12000);
    await sendScreen(bot, chatId, "📸 5. Dashboard loading complete");

    await context.storageState({ path: COOKIES_FILE });
    return { success: true };
  } catch (err) {
    await sendScreen(bot, chatId, "❌ OTP verify error");
    return { success: false, error: err.message };
  }
}

async function uploadFile(filePath, fileName, bot, chatId) {
  try {
    await launchBrowser();
    const fileSizeMB = (fs.statSync(filePath).size / 1024 / 1024).toFixed(2);

    await page.goto(`${JAZZDRIVE_URL}/#/folders`, { waitUntil: 'networkidle', timeout: 30000 });
    await sendScreen(bot, chatId, "📸 6. Folders page par aagaye");

    if (page.url().includes('login')) {
      return { success: false, error: 'Session expired. Re-login needed.' };
    }

    await page.waitForTimeout(2000);
    await page.waitForSelector('#uploadActionButton', { timeout: 10000 });
    await page.click('#uploadActionButton');

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 10000 }),
      page.click('text=Upload files')
    ]);

    await fileChooser.setFiles(filePath);
    await sendScreen(bot, chatId, `📸 7. Upload start ho gaya: ${fileName}`);

    const fileSize = fs.statSync(filePath).size;
    const waitMs = Math.max(30000, (fileSize / 1024 / 1024) * 3000);

    try {
      await page.waitForSelector('[role="progressbar"]', { timeout: 10000 });
      await page.waitForSelector('[role="progressbar"]', { state: 'hidden', timeout: waitMs });
    } catch {
      await page.waitForTimeout(Math.min(waitMs, 120000));
    }
    
    await sendScreen(bot, chatId, "📸 8. Upload progress complete!");

    return { success: true, fileName, fileSize: `${fileSizeMB} MB` };
  } catch (err) {
    await sendScreen(bot, chatId, "❌ Upload mein error aagaya");
    return { success: false, error: err.message };
  }
}

function cleanupFile(filePath) {
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
}

function isTokenValid() {
  return fs.existsSync(COOKIES_FILE);
}

async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null; context = null; page = null;
  }
}

module.exports = { requestOTP, verifyOTP, uploadFile, cleanupFile, isTokenValid, closeBrowser };
