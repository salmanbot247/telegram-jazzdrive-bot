require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { downloadMedia, ensureYtDlp, getVideoInfo } = require('./downloader');
const { requestOTP, verifyOTP, uploadFile, cleanupFile } = require('./jazzdrive');

const TOKEN = process.env.BOT_TOKEN;
const bot = new TelegramBot(TOKEN, { polling: true });

const userStates = new Map();

console.log('🤖 Telegram JazzDrive Bot start ho gaya!');

// URL check
function extractURL(text) {
  const m = text.match(/(https?:\/\/[^\s]+)/);
  return m ? m[0] : null;
}
function isSupportedURL(url) {
  return ['youtube.com','youtu.be','facebook.com','fb.watch',
          'instagram.com','twitter.com','x.com','tiktok.com',
          'dailymotion.com','soundcloud.com'].some(d => url.includes(d));
}

// ── /start command ────────────────────────
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `👋 *Salam! JazzDrive Bot mein khush aamdeed!*\n\n` +
    `📌 *Kaise use karein:*\n` +
    `1️⃣ YouTube/video link bhejo\n` +
    `2️⃣ Quality select karo\n` +
    `3️⃣ Jazz number bhejo\n` +
    `4️⃣ OTP enter karo\n` +
    `5️⃣ JazzDrive pe upload ho jaega ✅\n\n` +
    `_Abhi link bhejo!_`,
    { parse_mode: 'Markdown' }
  );
});

// ── Main message handler ──────────────────
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  if (!text || text.startsWith('/')) return;

  const state = userStates.get(chatId) || { step: 'idle' };

  // STEP 1: URL
  if (state.step === 'idle') {
    const url = extractURL(text);
    if (!url || !isSupportedURL(url)) return;

    await bot.sendMessage(chatId, '🔍 Video info check ho rahi hai...');
    try {
      const info = await getVideoInfo(url);
      const dur = info.duration
        ? `${Math.floor(info.duration/60)}:${String(info.duration%60).padStart(2,'0')}`
        : 'N/A';

      userStates.set(chatId, { step: 'awaiting_quality', url, title: info.title || 'Video' });

      await bot.sendMessage(chatId,
        `📹 *${info.title}*\n⏱️ ${dur}  👤 ${info.uploader||''}\n\n🎬 *Quality select karo:*`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '1️⃣ 360p (Fast)', callback_data: 'q_1' },
                { text: '2️⃣ 720p (HD)', callback_data: 'q_2' }
              ],
              [
                { text: '3️⃣ 1080p (FHD)', callback_data: 'q_3' },
                { text: '4️⃣ MP3 Audio', callback_data: 'q_4' }
              ]
            ]
          }
        }
      );
    } catch (err) {
      await bot.sendMessage(chatId, `❌ Video info nahi mili: ${err.message}`);
    }
    return;
  }

  // STEP 3: Jazz number
  if (state.step === 'awaiting_jazz_number') {
    if (!/^03[0-9]{9}$/.test(text)) {
      await bot.sendMessage(chatId, '❌ Galat format. 03XXXXXXXXX (11 numbers)');
      return;
    }
    await bot.sendMessage(chatId, '📤 OTP bheja ja raha hai...');
    const result = await requestOTP(text);
    if (!result.success) {
      await bot.sendMessage(chatId, `❌ OTP fail: ${result.error}`);
      userStates.set(chatId, { step: 'idle' });
      return;
    }
    userStates.set(chatId, { ...state, step: 'awaiting_otp', jazzPhone: text });
    await bot.sendMessage(chatId, `✅ OTP *${text}* pe bheja gaya!\n\n🔑 OTP enter karo:`, { parse_mode: 'Markdown' });
    return;
  }

  // STEP 4: OTP → Download → Upload
  if (state.step === 'awaiting_otp') {
    if (!/^[0-9]{4,6}$/.test(text)) {
      await bot.sendMessage(chatId, '❌ OTP sirf numbers (4-6 digits)');
      return;
    }

    await bot.sendMessage(chatId, '🔐 OTP verify ho raha hai...');
    const loginResult = await verifyOTP(state.jazzPhone, text);
    if (!loginResult.success) {
      await bot.sendMessage(chatId, `❌ Login fail: ${loginResult.error}`);
      userStates.set(chatId, { step: 'idle' });
      return;
    }

    await bot.sendMessage(chatId, '✅ JazzDrive login ho gaya!\n\n⬇️ Download ho raha hai...');

    let dl;
    try {
      dl = await downloadMedia(state.url, state.quality);
    } catch (err) {
      await bot.sendMessage(chatId, `❌ Download fail: ${err.message}`);
      userStates.set(chatId, { step: 'idle' });
      return;
    }

    await bot.sendMessage(chatId,
      `✅ Download complete!\n📁 ${dl.fileName}\n📦 ${(dl.fileSize/1024/1024).toFixed(2)} MB\n\n☁️ JazzDrive pe upload ho raha hai...`
    );

    const up = await uploadFile(dl.filePath, dl.fileName);
    cleanupFile(dl.filePath);

    if (!up.success) {
      await bot.sendMessage(chatId, `❌ Upload fail: ${up.error}`);
      userStates.set(chatId, { step: 'idle' });
      return;
    }

    await bot.sendMessage(chatId,
      `🎉 *Upload Complete!*\n\n📂 *${state.title}*\n📦 Size: ${up.fileSize}\n\n_JazzDrive app mein check karo — bilkul free!_ ✅`,
      { parse_mode: 'Markdown' }
    );

    userStates.set(chatId, { step: 'idle' });
  }
});

// ── Quality buttons ───────────────────────
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const state = userStates.get(chatId) || { step: 'idle' };

  if (data.startsWith('q_') && state.step === 'awaiting_quality') {
    const quality = data.replace('q_', '');
    const names = {'1':'360p','2':'720p','3':'1080p','4':'MP3'};

    await bot.answerCallbackQuery(query.id);
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
      chat_id: chatId, message_id: query.message.message_id
    });

    userStates.set(chatId, { ...state, step: 'awaiting_jazz_number', quality });
    await bot.sendMessage(chatId,
      `✅ *${names[quality]}* select hua!\n\n📱 *Jazz Number enter karo (03XXXXXXXXX):*`,
      { parse_mode: 'Markdown' }
    );
  }
});

// Keep alive
process.on('unhandledRejection', (err) => console.error('Unhandled:', err.message));
