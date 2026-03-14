require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const { downloadMedia } = require('./downloader');
const { requestOTP, verifyOTP, uploadFile, cleanupFile, isTokenValid } = require('./jazzdrive');

const TOKEN = process.env.BOT_TOKEN;
const bot = new TelegramBot(TOKEN, { polling: true });

const userStates = new Map();

console.log('🤖 Direct Link to JazzDrive Bot start ho gaya!');

function extractURL(text) {
  const m = text.match(/(https?:\/\/[^\s]+)/);
  return m ? m[0] : null;
}

function safeErrorMsg(errText) {
  if (!errText) return "Unknown Error";
  return errText.length > 500 ? errText.substring(0, 500) + "\n...[Error crop kiya gaya]" : errText;
}

// 🚀 Naya Function: Jo ek hi dafa download aur upload ka kaam sambhalega
async function processDownloadAndUpload(chatId, url) {
  await bot.sendMessage(chatId, '⬇️ Server pe file download ho rahi hai... (Thora intezar karein)');
  let dl;
  try {
    dl = await downloadMedia(url);
  } catch (err) {
    await bot.sendMessage(chatId, `❌ Download fail:\n${safeErrorMsg(err.message)}`);
    return;
  }

  await bot.sendMessage(chatId, `✅ Download complete!\n📁 ${dl.fileName}\n📦 ${(dl.fileSize/1024/1024).toFixed(2)} MB\n\n☁️ JazzDrive pe upload ho raha hai...`);

  const up = await uploadFile(dl.filePath, dl.fileName, bot, chatId);
  cleanupFile(dl.filePath);

  if (!up.success) {
    await bot.sendMessage(chatId, `❌ Upload fail:\n${safeErrorMsg(up.error)}`);
    // Agar session expire ho gaya toh cookie file delete kar dega
    if (up.error.includes('Session expired')) {
      try { fs.unlinkSync('./jazz_cookies.json'); } catch(e){}
      await bot.sendMessage(chatId, '⚠️ Session expire ho gaya hai. Dobara link bhej kar naye sire se login karein.');
    }
    return;
  }

  await bot.sendMessage(chatId, `🎉 *Upload Complete!*\n\n📂 *${dl.fileName}*\n📦 Size: ${up.fileSize}\n\n_JazzDrive app mein check karo!_ ✅`, { parse_mode: 'Markdown' });
}

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `👋 *Salam! Direct JazzDrive Bot mein khush aamdeed!*\n\n` +
    `📌 *Kaise use karein:*\n` +
    `1️⃣ Kisi bhi file ka direct download link bhejo\n` +
    `2️⃣ Agar pehle se login nahi hai, toh OTP do\n` +
    `3️⃣ JazzDrive pe upload ho jaega ✅\n\n` +
    `_Abhi link bhejo!_`,
    { parse_mode: 'Markdown' }
  );
});

// 🔴 Nayi Command: Logout karne ke liye
bot.onText(/\/logout/, (msg) => {
  try { fs.unlinkSync('./jazz_cookies.json'); } catch(e){}
  bot.sendMessage(msg.chat.id, '✅ Logout ho gaya. Ab naya link bhejne par dobara OTP mangega.');
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  if (!text || text.startsWith('/')) return;

  const state = userStates.get(chatId) || { step: 'idle' };

  if (state.step === 'idle') {
    const url = extractURL(text);
    if (!url) {
      await bot.sendMessage(chatId, '❌ Barae meharbani ek valid direct download link bhejein.');
      return;
    }

    // 🟢 NAYA HISSA: Check karein agar pehle se login hai
    if (isTokenValid()) {
      await bot.sendMessage(chatId, '✅ Aap pehle se login hain! Direct kam shuru kar raha hun...');
      await processDownloadAndUpload(chatId, url);
      return;
    }

    // Agar login nahi hai toh number mangega
    userStates.set(chatId, { step: 'awaiting_jazz_number', url });
    await bot.sendMessage(chatId, `✅ *Link mil gaya!*\n\n📱 *Apna Jazz Number enter karo (03XXXXXXXXX):*`, { parse_mode: 'Markdown' });
    return;
  }

  if (state.step === 'awaiting_jazz_number') {
    if (!/^03[0-9]{9}$/.test(text)) {
      await bot.sendMessage(chatId, '❌ Galat format. 03XXXXXXXXX (11 numbers)');
      return;
    }
    await bot.sendMessage(chatId, '📤 OTP bheja ja raha hai... (Abhi screenshots aayenge)');
    
    const result = await requestOTP(text, bot, chatId); 
    
    if (!result.success) {
      await bot.sendMessage(chatId, `❌ OTP fail:\n${safeErrorMsg(result.error)}`);
      userStates.set(chatId, { step: 'idle' });
      return;
    }
    userStates.set(chatId, { ...state, step: 'awaiting_otp', jazzPhone: text });
    await bot.sendMessage(chatId, `✅ OTP *${text}* pe bheja gaya!\n\n🔑 OTP enter karo:`, { parse_mode: 'Markdown' });
    return;
  }

  if (state.step === 'awaiting_otp') {
    if (!/^[0-9]{4,6}$/.test(text)) {
      await bot.sendMessage(chatId, '❌ OTP sirf numbers (4-6 digits)');
      return;
    }

    await bot.sendMessage(chatId, '🔐 OTP verify ho raha hai...');
    const loginResult = await verifyOTP(state.jazzPhone, text, bot, chatId);
    
    if (!loginResult.success) {
      await bot.sendMessage(chatId, `❌ Login fail:\n${safeErrorMsg(loginResult.error)}`);
      userStates.set(chatId, { step: 'idle' });
      return;
    }

    await bot.sendMessage(chatId, '✅ JazzDrive login ho gaya!');
    
    // Download aur Upload start karega
    await processDownloadAndUpload(chatId, state.url);
    
    userStates.set(chatId, { step: 'idle' });
  }
});

process.on('unhandledRejection', (err) => console.error('Unhandled:', err.message));
