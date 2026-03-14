require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { downloadMedia } = require('./downloader');
const { requestOTP, verifyOTP, uploadFile, cleanupFile } = require('./jazzdrive');

const TOKEN = process.env.BOT_TOKEN;
const bot = new TelegramBot(TOKEN, { polling: true });

const userStates = new Map();

console.log('🤖 Direct Link to JazzDrive Bot start ho gaya!');

function extractURL(text) {
  const m = text.match(/(https?:\/\/[^\s]+)/);
  return m ? m[0] : null;
}

// 🛡️ Naya Function: Telegram ko crash hone se bachaane ke liye
function safeErrorMsg(errText) {
  if (!errText) return "Unknown Error";
  return errText.length > 500 ? errText.substring(0, 500) + "\n...[Error lamba hone ki wajah se crop kar diya gaya]" : errText;
}

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `👋 *Salam! Direct JazzDrive Bot mein khush aamdeed!*\n\n` +
    `📌 *Kaise use karein:*\n` +
    `1️⃣ Kisi bhi file ka direct download link bhejo\n` +
    `2️⃣ Jazz number bhejo\n` +
    `3️⃣ OTP enter karo\n` +
    `4️⃣ JazzDrive pe upload ho jaega ✅\n\n` +
    `_Abhi link bhejo!_`,
    { parse_mode: 'Markdown' }
  );
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
    
    // Yahan humne bot aur chatId pass kar diya hai
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

    await bot.sendMessage(chatId, '✅ JazzDrive login ho gaya!\n\n⬇️ Server pe file download ho rahi hai... (Thora intezar karein)');

    let dl;
    try {
      dl = await downloadMedia(state.url);
    } catch (err) {
      await bot.sendMessage(chatId, `❌ Download fail:\n${safeErrorMsg(err.message)}`);
      userStates.set(chatId, { step: 'idle' });
      return;
    }

    await bot.sendMessage(chatId, `✅ Download complete!\n📁 ${dl.fileName}\n📦 ${(dl.fileSize/1024/1024).toFixed(2)} MB\n\n☁️ JazzDrive pe upload ho raha hai...`);

    const up = await uploadFile(dl.filePath, dl.fileName, bot, chatId);
    cleanupFile(dl.filePath);

    if (!up.success) {
      await bot.sendMessage(chatId, `❌ Upload fail:\n${safeErrorMsg(up.error)}`);
      userStates.set(chatId, { step: 'idle' });
      return;
    }

    await bot.sendMessage(chatId, `🎉 *Upload Complete!*\n\n📂 *${dl.fileName}*\n📦 Size: ${up.fileSize}\n\n_JazzDrive app mein check karo — bilkul free!_ ✅`, { parse_mode: 'Markdown' });

    userStates.set(chatId, { step: 'idle' });
  }
});

process.on('unhandledRejection', (err) => console.error('Unhandled:', err.message));
