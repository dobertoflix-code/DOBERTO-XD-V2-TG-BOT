require('./setting/config')
const fs = require('fs');
const {
    Telegraf,
    Context,
    Markup
} = require('telegraf')
const {
    message,
    editedMessage,
    channelPost,
    editedChannelPost,
    callbackQuery
} = require("telegraf/filters");
const path = require('path');
const os = require('os')
const yts = require('yt-search');
const { ytdl } = require('./allfunc/scrape-ytdl');
const startpairing = require('./pair');
const { BOT_TOKEN } = require('./token');
    const adminFilePath = './database/admintele.json';
const bannedPath = './richstore/pairing/banned.json';
// Helper to format runtime duration
const ITEMS_PER_PAGE = 10;
const pagedListPairs = {}; // In-memory cache for each admin
// Track when bot started
const botStartTime = Date.now();
const { 
  default: baileys, proto, jidNormalizedUser, generateWAMessage, 
  generateWAMessageFromContent, getContentType, prepareWAMessageMedia 
} = require("@whiskeysockets/baileys");
const { makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const {
  downloadContentFromMessage, emitGroupParticipantsUpdate, emitGroupUpdate, 
  generateWAMessageContent, makeInMemoryStore, MediaType, areJidsSameUser, 
  WAMessageStatus, downloadAndSaveMediaMessage, AuthenticationState, 
  GroupMetadata, initInMemoryKeyStore, MiscMessageGenerationOptions, 
  useSingleFileAuthState, BufferJSON, WAMessageProto, MessageOptions, 
  WAFlag, WANode, WAMetric, ChatModification, MessageTypeProto, 
  WALocationMessage, WAContextInfo, WAGroupMetadata, ProxyAgent, 
  waChatKey, MimetypeMap, MediaPathMap, WAContactMessage, 
  WAContactsArrayMessage, WAGroupInviteMessage, WATextMessage, 
  WAMessageContent, WAMessage, BaileysError, WA_MESSAGE_STATUS_TYPE, 
  MediariyuInfo, URL_REGEX, WAUrlInfo, WA_DEFAULT_EPHEMERAL, 
  WAMediaUpload, mentionedJid, processTime, Browser, MessageType, 
  Presence, WA_MESSAGE_STUB_TYPES, Mimetype, relayWAMessage, Browsers, 
  GroupSettingChange, DisriyuectReason, WASocket, getStream, WAProto, 
  isBaileys, AnyMessageContent, fetchLatestBaileysVersion, 
  templateMessage, InteractiveMessage, Header 
} = require("@whiskeysockets/baileys");

// Check if adminID.json exists, if not, create it with your ID
if (!fs.existsSync(adminFilePath)) {
  const defaultAdmin = [String(process.env.OWNER_ID || '8896518461')]; // fallback if OWNER_ID is not set
  fs.writeFileSync(adminFilePath, JSON.stringify(defaultAdmin, null, 2));
}
// Handle listpair pagination

const userStore = './richstore/pairing/users.json';

function trackUser(id) {
  const users = JSON.parse(fs.readFileSync(userStore));
  if (!users.includes(id)) {
    users.push(id);
    fs.writeFileSync(userStore, JSON.stringify(users, null, 2));
  }
}
const adminIDs = JSON.parse(fs.readFileSync(adminFilePath, 'utf8'));
const bot = new Telegraf(BOT_TOKEN);
const premium_file = './premium.json';
let premiumUsers = [];

try {
  if (fs.existsSync(premium_file)) {
    premiumUsers = JSON.parse(fs.readFileSync(premium_file, 'utf-8'));
  } else {
    fs.writeFileSync(premium_file, JSON.stringify([]));
  }
} catch (error) {
  console.error('Failed to load premium users:', error);
}
const userStates = {};
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function getPushName(ctx) {
  return ctx.from.first_name || ctx.from.username || "User";
}
function sendListPairPage(ctx, userID, pageIndex) {
  const pairedDevices = pagedListPairs[userID] || [];
  const totalPages = Math.max(1, Math.ceil(pairedDevices.length / ITEMS_PER_PAGE));

  // Clamp pageIndex to valid range
  pageIndex = Math.min(Math.max(pageIndex, 0), totalPages - 1);

  const start = pageIndex * ITEMS_PER_PAGE;
  const currentPage = pairedDevices.slice(start, start + ITEMS_PER_PAGE);

  const pageText = currentPage.length
    ? currentPage.map((id, i) => `𝗗𝗢𝗕𝗘𝗥𝗧𝗢 𝗠𝗗\n\n𝐕1*${start + i + 1}.* \`ID:\` ${id}`).join('\n⎔')
    : "_No paired devices found._";

  const navButtons = [];
  if (pageIndex > 0) navButtons.push({ text: '⬅️ Back', callback_data: `listpair_page_${pageIndex - 1}` });
  if (pageIndex < totalPages - 1) navButtons.push({ text: '➡️ Next', callback_data: `listpair_page_${pageIndex + 1}` });

  const text = `𝗗𝗢𝗕𝗘𝗥𝗧𝗢 𝗠𝗗\n\n𝐕2 *Paired Bots (Page ${pageIndex + 1}/${totalPages}):*\n\n⎔${pageText}`;

  // ✅ Try editing the existing message, fallback to sending new
  ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: navButtons.length ? [navButtons] : [] }
  }).catch(() => {
    ctx.reply(text, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: navButtons.length ? [navButtons] : [] }
    });
  });
}
function sendDelPairPage(ctx, userID, pageIndex) {
  const pairedDevices = pagedListPairs[userID] || [];
  const totalPages = Math.max(1, Math.ceil(pairedDevices.length / ITEMS_PER_PAGE));

  // Clamp pageIndex to valid range
  pageIndex = Math.min(Math.max(pageIndex, 0), totalPages - 1);

  const start = pageIndex * ITEMS_PER_PAGE;
  const currentPage = pairedDevices.slice(start, start + ITEMS_PER_PAGE);

  const keyboard = currentPage.map(id => [
    { text: `🗑️ ${id}`, callback_data: `delpair_${id}` }
  ]);

  const navButtons = [];
  if (pageIndex > 0) navButtons.push({ text: '⬅️ Back', callback_data: `delpair_page_${pageIndex - 1}` });
  if (pageIndex < totalPages - 1) navButtons.push({ text: '➡️ Next', callback_data: `delpair_page_${pageIndex + 1}` });

  if (navButtons.length) keyboard.push(navButtons);

  const text = pairedDevices.length
    ? `Delete Paired Devices (Page ${pageIndex + 1}/${totalPages}):\n\nTap a device ID to delete.`
    : "_No paired devices found._";

  ctx.deleteMessage().catch(() => {});
  ctx.reply(text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard }
  });
}
function formatRuntime(seconds) {
  const pad = (s) => (s < 10 ? '0' + s : s);
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${pad(hrs)}h ${pad(mins)}m ${pad(secs)}s`;
}
bot.command('ping', async (ctx) => {
  const uptime = Math.floor((Date.now() - botStartTime) / 1000);
  ctx.reply(`  𝗗𝗢𝗕𝗘𝗥𝗧𝗢\n𝗠𝗗 *𝙿𝚒𝚗𝚐*\n𝚁𝚞𝚗𝚝𝚒𝚖𝚎: *${formatRuntime(uptime)}*`, {
    parse_mode: 'Markdown'
  });
});
bot.start((ctx) => {
  const userId = ctx.from.id;
  trackUser(userId); // Track user for broadcast

ctx.reply('𝗗𝗢𝗕𝗘𝗥𝗧𝗢 𝗠𝗗\n\n𝚄𝚂𝙴 𝙼𝚈 𝙱𝙾𝚃 𝙲𝙰𝚁𝙴𝙵𝚄𝙻𝙻𝚈\n 𝚃𝙾 𝚄𝚂𝙴𝙳 𝙼𝚈 𝙱𝙾𝚃 𝙲𝙻𝙸𝙲𝙺 𝙿𝙰𝙸𝚁𝙸𝙽𝙶\n\n', {
  reply_markup: {
    inline_keyboard: [
      [
        { text: 'sᴛᴀʀᴛ ᴘᴀɪʀɪɴɢ', callback_data: 'start_bot' }
      ]
    ]
  }
});
});
bot.action('start_bot', async (ctx) => {
  const pushname = getPushName(ctx);
  const photoUrl = 'https://files.catbox.moe/q41gsb.png';
  const captionText =`  
╭━━━〔【】𝗗𝗢𝗕𝗘𝗥𝗧𝗢 𝗠𝗗【】〕
┃✦╭──────────────────
┃✦│ 𝐃𝐄𝐕 : @DobertomrlitDev
┃✦│ 𝐁𝐎𝐓 : 𝗗𝗢𝗕𝗘𝗥𝗧𝗢 𝗠𝗗
┃✦│ 𝐕𝐄𝐑𝐒𝐈𝐎𝐍 : 1.1.0
┃✦╰──────────────────
╰━━━━━━━━━━━━━━━┈⊷

╭━━  【】 𝗜𝗡𝗙𝗢 𝗣𝗔𝗜𝗥 【】
┃✦│ /connect
┃✦│ /delpair
┃✦│ /ping
╰━━━━━━━━━━━━━━━┈⊷
┃✦𝗣𝗢𝗪𝗘𝗥𝗘𝗗 𝗕𝗬 𝗗𝗢𝗕𝗘𝗥𝗧𝗢 𝗗𝗘𝗩
`;
    
  const buttons = Markup.inlineKeyboard([
    [
      Markup.button.url('ᴛɢ ɢʀᴏᴜᴘ', 'https://t.me/+X03kb_DdIFUyYjkx'),
      Markup.button.url('ᴛɢ ᴄʜᴀɴɴᴇʟ', 'https://t.me/dobertomrlitdevcanal')
      
    ]
  ]);

  try {
    await ctx.sendChatAction('upload_photo');
    await ctx.replyWithPhoto(photoUrl, {
      caption: captionText,
      parse_mode: 'HTML',
      ...buttons
    });
  } catch (err) {
    console.error('Image failed to load, sending fallback text:', err);
    await ctx.reply(`${captionText}`, {
      parse_mode: 'HTML',
      ...buttons
    });
  }
});
bot.command('groupid', async (ctx) => {
  await ctx.reply(`Chat ID: ${ctx.chat.id}\nType: ${ctx.chat.type}`);
});
bot.command('connect', async (ctx) => {
  try {
    const userId = ctx.from.id;

    const channelUsernames = ['@dobertomrlitdevcanal', -1003729525861]; // Your required channels
    let joinedAllChannels = true;
    for (const channel of channelUsernames) {
      try {
        const member = await ctx.telegram.getChatMember(channel, userId);
        if (['left', 'kicked'].includes(member.status)) {
          joinedAllChannels = false;
          break;
        }
      } catch (e) {
        console.error(`getChatMember failed for channel ${channel}:`, e.message);
        joinedAllChannels = false;
        break;
      }
    }

    if (!joinedAllChannels) {
      return ctx.reply(
        `𝗗𝗢𝗕𝗘𝗥𝗧𝗢 𝗠𝗗\n\n𝗗𝗼 𝘁𝗵𝗲 𝗳𝗼𝗹𝗹𝗼𝘄𝗶𝗻𝗴\n𝗷𝗼𝗶𝗻 𝗮𝗹𝗹 𝗽𝗿𝗼𝗽𝗼𝘀𝗮𝗹\n 𝗶𝗳 𝗱𝗼𝗻𝗲 𝗽𝗿𝗲𝘀𝘀 "𝗝𝗼𝗶𝗻𝗲𝗱"\n
        𝗗𝗲𝘃: @DobertomrlitDev`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: 'ᴛᴏᴏʟ ᴄʜᴀɴɴᴇʟ', url: 'https://t.me/dobertomrlitdevcanal' }],
              [{ text: 'ᴘʀɪɴᴄɪᴘᴀʟ ɢʀᴏᴜᴘ', url: 'https://t.me/+X03kb_DdIFUyYjkx' }],
              [{ text: 'ɪ ʜᴀᴠᴇ ᴊᴏɪɴ', callback_data: 'check_join' }]
            ]
          }
        }
      );
    }

    const text = ctx.message.text.split(' ')[1];
    if (!text) {
      return ctx.reply('𝗗𝗢𝗕𝗘𝗥𝗧𝗢 𝗠𝗗\n\n ʜᴏᴡ ᴛᴏ ᴄᴏɴɴᴇᴄᴛ\n ᴇɴᴛᴇʀ ʏᴏᴜʀ ᴡʜᴀᴛsᴀᴘᴘ ɴᴜᴍʙᴇʀ ᴜsɪɴɢ ᴛʜᴇ ғᴏʀᴍᴀᴛ ʙᴇʟᴏᴡ\n ᴇxᴀᴍᴘʟᴇ: /connect 509xxxxx', { parse_mode: 'Markdown' });
    }

    if (/[a-z]/i.test(text)) {
      return ctx.reply('Please enter a valid phone number.');
    }

    if (!/^\d{7,15}(\|\d{1,10})?$/.test(text)) {
      return ctx.reply('Enter number in this format: 509xxxx(numbers only, no symbols or letters❌)', { parse_mode: 'Markdown' });
    }

    if (text.startsWith('0')) {
      return ctx.reply('Please use a different number format.');
    }

    const target = text.split("|")[0];
    const Xreturn = ctx.message.reply_to_message
      ? ctx.message.reply_to_message.from.id
      : target.replace(/[^0-9]/g, '') + "@s.whatsapp.net";

    if (!Xreturn) {
      return ctx.reply("This number is not registered on WhatsApp");
    }

    const countryCode = text.slice(0, 3);
    const prefixxx = text.slice(0, 1);
    if (["252", "229", "92", "0"].includes(countryCode) || prefixxx === "0") {
      return ctx.reply("🚫Sorry, numbers with this country code are not supported.");
    }
    
const pairingFolder = './richstore/pairing';
const pairedUsersFromJson = fs.readdirSync(pairingFolder).filter(file => file.endsWith('@s.whatsapp.net')).length;
if (pairedUsersFromJson >= 70) {
  return ctx.reply(`*Pairing not more available contact owner to create another server*`);
}
    const startpairing = require('./pair.js');
    await startpairing(Xreturn);
    await sleep(4000);

    const cu = fs.readFileSync('./richstore/pairing/pairing.json', 'utf-8');
    const cuObj = JSON.parse(cu);

    ctx.reply(
      ` 
     𝗗𝗢𝗕𝗘𝗥𝗧𝗢 𝗠𝗗
 ʏᴏᴜʀ ᴘᴀɪʀɪɴɢ 
 ᴘᴀɪʀ ɴᴜᴍʙᴇʀ: \`${target}\`
 ʏᴏᴜʀ ᴄᴏᴅᴇ: \`${cuObj.code}\`
`,
      {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [{ text: 'ᴛɢ ᴄʜᴀɴɴᴇʟ', url: 'https://t.me/dobertomrlitdevcanal' }]
          ]
        }
          }
    );
  } catch (error) {
    console.error('Error in pair command:', error);
    ctx.reply('⎔An error occurred while processing your request.');
  }
});
bot.action('check_join', async (ctx) => {
  const channelUsernames = 
  ['@dobertomrlitdevcanal', -1003729525861];
  const userId = ctx.from.id;
  let joinedAllChannels = true;

  for (const channel of channelUsernames) {
    try {
      const member = await ctx.telegram.getChatMember(channel, userId);
      if (['left', 'kicked'].includes(member.status)) {
        joinedAllChannels = false;
        break;
      }
    } catch (e) {
      console.error(`getChatMember failed for channel ${channel}:`, e.message);
      joinedAllChannels = false;
      break;
    }
  }

  if (joinedAllChannels) {
    ctx.reply('You have successfully joined all requests.');
  } else {
    ctx.answerCbQuery('You haven’t joined yet pls do.', { show_alert: true });
  }
});
bot.command('listpair', async (ctx) => {
  const userID = ctx.from.id.toString();

  if (!adminIDs.includes(userID)) {
    return ctx.reply("Unauthorized access 🚫");
  }

  const pairingPath = './richstore/pairing';
  if (!fs.existsSync(pairingPath)) return ctx.reply('No paired devices found.');

  const entries = fs.readdirSync(pairingPath, { withFileTypes: true });
  const pairedDevices = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);

  if (pairedDevices.length === 0) return ctx.reply('No paired devices found.');

  pagedListPairs[userID] = pairedDevices;
  sendListPairPage(ctx, userID, 0);
});
bot.command('deluser', async (ctx) => {
  const userID = ctx.from.id.toString();

  if (!adminIDs.includes(userID)) {
    return ctx.reply(`Unauthorized access🚫.`);
  }

  const pairingPath = './richstore/pairing';
  if (!fs.existsSync(pairingPath)) return ctx.reply('No paired devices found.');

  const entries = fs.readdirSync(pairingPath, { withFileTypes: true });
  const pairedDevices = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);

  if (pairedDevices.length === 0) return ctx.reply('No paired devices found.');

  pagedListPairs[userID] = pairedDevices;
  sendDelPairPage(ctx, userID, 0);
});
bot.command('broadcast', async (ctx) => {
  const senderId = ctx.from.id;
  const message = ctx.message.text.split(' ').slice(1).join(' ');

  if (!adminIDs.includes(senderId.toString())) {
    return ctx.reply('Unauthorized access🚫.');
  }

  if (!message) {
    return ctx.reply('𝗗𝗢𝗕𝗘𝗥𝗧𝗢 𝗠𝗗\n\n Please provide a message to broadcast.\n Usage: /broadcast Hello users!');
  }

  const users = JSON.parse(fs.readFileSync('./richstore/pairing/users.json'));

  let success = 0;
  let failed = 0;

  for (const userId of users) {
    try {
      await ctx.telegram.sendMessage(userId, `𝗗𝗢𝗕𝗘𝗥𝗧𝗢 𝗠𝗗\n\n𝙼𝚂𝙶:${message}`, {
        parse_mode: 'Markdown'
      });
      success++;
    } catch {
      failed++;
    }
  }

  ctx.reply(`Broadcast complete.\n\nSuccess: ${success}\nFailed: ${failed}`);
});

bot.command('xreport', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length === 0) {
    return ctx.reply('𝗗𝗢𝗕𝗘𝗥𝗧𝗢 𝗠𝗗\n\n Usage: /xreport 509xxxx');
  }

  const targetNumber = args[0].replace(/\D/g, '');
  if (!targetNumber) {
    return ctx.reply('Invalid number. Use digits only.');
  }

  const targetJid = jidNormalizedUser(`${targetNumber}@s.whatsapp.net`);
  const pairingPath = './richstore/pairing';

  if (!fs.existsSync(pairingPath)) {
    return ctx.reply('No active paired devices found.');
  }

  // ✅ Get session directories, not JSON files
  const sessions = fs.readdirSync(pairingPath, { withFileTypes: true })
                     .filter(entry => entry.isDirectory())
                     .map(entry => path.join(pairingPath, entry.name));

  if (sessions.length === 0) {
    return ctx.reply('No active WhatsApp sessions to perform report.');
  }

  ctx.reply(
    `𝗗𝗢𝗕𝗘𝗥𝗧𝗢 𝗠𝗗\n\n 🚨 Starting *mass-report* on +${targetNumber} using ${sessions.length} paired bots...`,
    { parse_mode: 'Markdown' }
  );

  for (const sessionPath of sessions) {
    try {
      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

      const rich = makeWASocket({ auth: state });
      rich.ev.on('creds.update', saveCreds);

      for (let i = 0; i < 30; i++) {
        try {
          await rich.ws.sendNode({
            tag: 'iq',
            attrs: { to: 's.whatsapp.net', type: 'set', xmlns: 'w:report' },
            content: [
              {
                tag: 'report',
                attrs: { to: targetJid, type: 'spam', id: rich.generateMessageTag() },
                content: []
              }
            ]
          });
          console.log(`✅ Report ${i + 1} sent from ${path.basename(sessionPath)}`);
          await sleep(2000);
        } catch (err) {
          console.error(`❌ Report attempt ${i + 1} failed for ${path.basename(sessionPath)}:`, err.message);
        }
      }
    } catch (err) {
      console.error(`❌ Error with session ${path.basename(sessionPath)}:`, err.message);
    }
  }

  ctx.reply(
    `𝗗𝗢𝗕𝗘𝗥𝗧𝗢 𝗠𝗗\n\n✅ Finished sending reports on *${targetNumber}*`,
    { parse_mode: 'Markdown' }
  );
});
bot.command('delpair', async (ctx) => {
  const text = ctx.message.text.trim();
  const args = text.split(' ').slice(1);

  if (args.length === 0) {
    return ctx.reply('𝗗𝗢𝗕𝗘𝗥𝗧𝗢 𝗠𝗗\n\nᴜsᴇ ғᴏʀᴍᴀᴛ ʙᴇʟᴏᴡ\n ᴜsᴀɢᴇ: /delpair 509xxxx', { parse_mode: 'Markdown' });
  }

  const inputNumber = args[0].replace(/\D/g, ''); // Remove non-numeric characters
  const jidSuffix = `${inputNumber}@s.whatsapp.net`;

  const pairingPath = './richstore/pairing';
  if (!fs.existsSync(pairingPath)) {
    return ctx.reply('No paired devices found.');
  }

  const entries = fs.readdirSync(pairingPath, { withFileTypes: true });
  const matched = entries.find(entry => entry.isDirectory() && entry.name.endsWith(jidSuffix));

  if (!matched) {
    return ctx.reply(`No paired device found for number ${inputNumber}`, { parse_mode: 'Markdown' });
  }

  const targetPath = `${pairingPath}/${matched.name}`;
  fs.rmSync(targetPath, { recursive: true, force: true });

  ctx.reply(
    `𝗗𝗢𝗕𝗘𝗥𝗧𝗢 𝗠𝗗\n
ᴇɴᴅɪɴɢ ᴘᴀɪʀᴀɪɴɢ
ɴᴜᴍʙᴇʀ ᴘᴀɪʀ: \`${inputNumber}\`
ɪᴅ: \`${matched.name}\`
`,
    { parse_mode: 'Markdown' }
  );
});
bot.on('textffft', async (ctx) => {
    const userId = ctx.from.id;

    if (userStates[userId] === 'waiting_for_song') {
        const text = ctx.message.text;

        try {
            ctx.reply('looking for...');
            const search = await yts(text);
            const telaso = search.all[0].url;
            const response = await ytdl(telaso);
            const puki = response.data.mp3;

            await ctx.replyWithAudio({ url: puki }, {
                caption: `Title: ${search.all[0].title}\nDuration: ${search.all[0].timestamp}`,
            });
            ctx.reply('🔓 Selesai!');
        } catch (error) {
            console.error(error);
            ctx.reply('An error occurred while downloading the song, please try again later.');
        }

        delete userStates[userId];
    }
});

bot.launch()
    .then(() => console.log('The bot is running successfully'))
    .catch(err => console.error('Error while running bot:', err));

module.exports = bot;
