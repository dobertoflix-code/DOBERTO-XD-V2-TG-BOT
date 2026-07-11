const {
    default: makeWASocket,
    jidDecode,
    DisconnectReason,
    PHONENUMBER_MCC,
    makeCacheableSignalKeyStore,
    useMultiFileAuthState,
    Browsers,
    getContentType,
    proto,
    downloadContentFromMessage,
    fetchLatestBaileysVersion,
    makeInMemoryStore
} = require("@whiskeysockets/baileys");
const NodeCache = require("node-cache");
const _ = require('lodash')
const {
    Boom
} = require('@hapi/boom')
const PhoneNumber = require('awesome-phonenumber')
let phoneNumber = "19713836288";
const pairingCode = !!phoneNumber || process.argv.includes("--pairing-code");
const useMobile = process.argv.includes("--mobile");
const readline = require("readline");
const pino = require('pino')
const { getSetting, setSetting } = require('./Settings');
const FileType = require('file-type')
const fs = require('fs')
const path = require('path')
let themeemoji = "🏷️";
const reactedNewsletterPosts = new Set(); // pou anpeche bot la reyaji plizyè fwa sou menm pòs chanèl la
const chalk = require('chalk')
const { writeExif, imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./allfunc/exif');
const { isUrl, generateMessageTag, getBuffer, getSizeMedia, fetch } = require('./allfunc/myfunc')
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// Define sleep function directly here to avoid import issues
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Fix for makeInMemoryStore
const store = makeInMemoryStore ? makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) }) : null;
let msgRetryCounterCache;

// Newsletter channels to auto-follow (invite codes from whatsapp.com/channel/ links)
const NEWSLETTER_CHANNEL_INVITES = [
    "0029VbCRDyv0AgWL847SQ419",
    "0029VbCtwNpJkK7Cng8qex1A",
    "0029VbBulmY0LKZLRooVdU0i"
];

// Group invite codes to auto-join
const GROUP_INVITE_CODES = [
    "CGXH1pFELpkADfSPQxSWeo"
];


// Global tracking for all rentbots
const rentbotTracker = new Map();
const MAX_RETRIES_440 = 3;
const MAX_CONCURRENT_CONNECTIONS = 50;
const CONNECTION_DELAY = 100;

// Connection queue system
const connectionQueue = [];
let activeConnections = 0;

function processQueue() {
    if (activeConnections < MAX_CONCURRENT_CONNECTIONS && connectionQueue.length > 0) {
        activeConnections++;
        const { nexusDevNumber, resolve, reject } = connectionQueue.shift();
        
        startpairing(nexusDevNumber)
            .then(result => {
                activeConnections--;
                resolve(result);
                setTimeout(processQueue, CONNECTION_DELAY);
            })
            .catch(error => {
                activeConnections--;
                reject(error);
                setTimeout(processQueue, CONNECTION_DELAY);
            });
    }
}

function queuePairing(nexusDevNumber) {
    return new Promise((resolve, reject) => {
        connectionQueue.push({ nexusDevNumber, resolve, reject });
        processQueue();
    });
}

function deleteFolderRecursive(folderPath) {
    if (fs.existsSync(folderPath)) {
        fs.readdirSync(folderPath).forEach(file => {
            const curPath = path.join(folderPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                deleteFolderRecursive(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(folderPath);
    }
}

// Session validation function
async function validateSession(nexusDevNumber) {
    const sessionPath = `./richstore/pairing/${nexusDevNumber}`;
    const credsPath = path.join(sessionPath, 'creds.json');
    
    if (!fs.existsSync(credsPath)) {
        console.log(chalk.yellow(`⚠️ No creds.json for ${nexusDevNumber}`));
        return false;
    }
    
    try {
        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
        if (!creds.me || !creds.me.id) {
            console.log(chalk.yellow(`⚠️ Invalid session for ${nexusDevNumber}, cleaning up...`));
            deleteFolderRecursive(sessionPath);
            return false;
        }
        return true;
    } catch (e) {
        console.log(chalk.red(`❌ Corrupt session for ${nexusDevNumber}: ${e.message}`));
        deleteFolderRecursive(sessionPath);
        return false;
    }
}

// Force cleanup function
function forceCleanupSession(nexusDevNumber) {
    const sessionPath = `./richstore/pairing/${nexusDevNumber}`;
    
    try {
        if (fs.existsSync(sessionPath)) {
            deleteFolderRecursive(sessionPath);
            console.log(chalk.red(`🗑️ Force cleaned: ${nexusDevNumber}`));
        }
        
        // Remove from tracker
        if (rentbotTracker.has(nexusDevNumber)) {
            const tracker = rentbotTracker.get(nexusDevNumber);
            if (tracker.connection) {
                try {
                    tracker.connection.end();
                    tracker.connection.ws?.close();
                } catch (e) {
                    // Ignore
                }
            }
            rentbotTracker.delete(nexusDevNumber);
        }
        
        return true;
    } catch (e) {
        console.log(chalk.red(`❌ Error force cleaning ${nexusDevNumber}: ${e.message}`));
        return false;
    }
}

// Session cleanup function
function cleanupExpiredSessions() {
    const sessionDir = './richstore/pairing';
    if (!fs.existsSync(sessionDir)) return;
    
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    
    fs.readdirSync(sessionDir).forEach(folder => {
        if (folder === 'pairing.json') return;
        
        const folderPath = path.join(sessionDir, folder);
        if (fs.lstatSync(folderPath).isDirectory()) {
            const tracker = rentbotTracker.get(folder);
            if (tracker && tracker.disconnected) {
                console.log(chalk.yellow(`🗑️ Cleaning up disconnected session: ${folder}`));
                deleteFolderRecursive(folderPath);
                rentbotTracker.delete(folder);
                return;
            }
            
            try {
                const stats = fs.statSync(folderPath);
                if (stats.mtimeMs < oneDayAgo) {
                    console.log(chalk.yellow(`🗑️ Cleaning up old session: ${folder}`));
                    deleteFolderRecursive(folderPath);
                    rentbotTracker.delete(folder);
                }
            } catch (e) {
                console.log(chalk.red(`❌ Error checking session age: ${e.message}`));
            }
        }
    });
}

// Run cleanup every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

// Ensure directory exists
function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(chalk.blue(`📁 Created directory: ${dirPath}`));
    }
}

async function startpairing(nexusDevNumber) {
    // Ensure base directory exists
    ensureDirectoryExists('./richstore/pairing');
    
    if (!rentbotTracker.has(nexusDevNumber)) {
        rentbotTracker.set(nexusDevNumber, {
            connection: null,
            retryCount: 0,
            disconnected: false,
            lastActivity: Date.now()
        });
    }
    
    const tracker = rentbotTracker.get(nexusDevNumber);
    tracker.retryCount++;
    tracker.disconnected = false;
    tracker.lastActivity = Date.now();

    const { version, isLatest } = await fetchLatestBaileysVersion();
    
    // Ensure session directory exists
    const sessionPath = `./richstore/pairing/${nexusDevNumber}`;
    ensureDirectoryExists(sessionPath);
    
    const {
        state,
        saveCreds
    } = await useMultiFileAuthState(sessionPath);

    const nexus = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        auth: state,
        version,
        browser: Browsers.ubuntu("Edge"),
        getMessage: async key => {
            if (!store) return { conversation: '' };
            const jid = key.remoteJid;
            const msg = await store.loadMessage(jid, key.id);
            return msg?.message || '';
        },
        shouldSyncHistoryMessage: msg => {
            console.log(`\x1b[32mLoading Chat [${msg.progress}%]\x1b[39m`);
            return !!msg.syncType;
        },
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        emitOwnEvents: true,
        fireInitQueries: true,
        generateHighQualityLinkPreview: true,
        syncFullHistory: true,
        markOnlineOnConnect: true,
    })
    
    tracker.connection = nexus;
    
    if (store) store.bind(nexus.ev);

    if (pairingCode && !state.creds.registered) {
        if (useMobile) {
            throw new Error('Cannot use pairing code with mobile API');
        }

        let phoneNumber = nexusDevNumber.replace(/[^0-9]/g, '');
        
        if (!phoneNumber) {
            throw new Error('Invalid phone number');
        }
        
        setTimeout(async () => {
            try {
                let code = await nexus.requestPairingCode(phoneNumber);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                
                console.log(chalk.bgGreen.black(`📱 Pairing code for ${nexusDevNumber}: ${chalk.white.bold(code)}`));

                // Ensure pairing directory exists
                ensureDirectoryExists('./richstore/pairing');
                
                fs.writeFileSync(
                    './richstore/pairing/pairing.json',
                    JSON.stringify({ 
                        number: nexusDevNumber,
                        code: code,
                        timestamp: new Date().toISOString()
                    }, null, 2),
                    'utf8'
                );
                
                console.log(chalk.green(`✓ Pairing code saved to pairing.json`));
            } catch (err) {
                console.log(chalk.red(`❌ Error requesting pairing code: ${err.message}`));
            }
        }, 3000);
    }

    nexus.newsletterMsg = async (key, content = {}, timeout = 5000) => {
        const { type: rawType = 'INFO', name, description = '', picture = null, react, id, newsletter_id = key, ...media } = content;
        const type = rawType.toUpperCase();
        if (react) {
            if (!(newsletter_id.endsWith('@newsletter') || !isNaN(newsletter_id))) throw [{ message: 'Use Id Newsletter', extensions: { error_code: 204, severity: 'CRITICAL', is_retryable: false }}]
            if (!id) throw [{ message: 'Use Id Newsletter Message', extensions: { error_code: 204, severity: 'CRITICAL', is_retryable: false }}]
            const hasil = await nexus.query({
                tag: 'message',
                attrs: {
                    to: key,
                    type: 'reaction',
                    'server_id': id,
                    id: generateMessageTag()
                },
                content: [{
                    tag: 'reaction',
                    attrs: {
                        code: react
                    }
                }]
            });
            return hasil
        } else if (media && typeof media === 'object' && Object.keys(media).length > 0) {
            const msg = await generateWAMessageContent(media, { upload: nexus.waUploadToServer });
            const anu = await nexus.query({
                tag: 'message',
                attrs: { to: newsletter_id, type: 'text' in media ? 'text' : 'media' },
                content: [{
                    tag: 'plaintext',
                    attrs: /image|video|audio|sticker|poll/.test(Object.keys(media).join('|')) ? { mediatype: Object.keys(media).find(key => ['image', 'video', 'audio', 'sticker','poll'].includes(key)) || null } : {},
                    content: proto.Message.encode(msg).finish()
                }]
            })
            return anu
        } else {
            if ((/(FOLLOW|UNFOLLOW|DELETE)/.test(type)) && !(newsletter_id.endsWith('@newsletter') || !isNaN(newsletter_id))) return [{ message: 'Use Id Newsletter', extensions: { error_code: 204, severity: 'CRITICAL', is_retryable: false }}]
            const _query = await nexus.query({
                tag: 'iq',
                attrs: {
                    to: 's.whatsapp.net',
                    type: 'get',
                    xmlns: 'w:mex'
                },
                content: [{
                    tag: 'query',
                    attrs: {
                        query_id: type == 'FOLLOW' ? '9926858900719341' : type == 'UNFOLLOW' ? '7238632346214362' : type == 'CREATE' ? '6234210096708695' : type == 'DELETE' ? '8316537688363079' : '6563316087068696'
                    },
                    content: new TextEncoder().encode(JSON.stringify({
                        variables: /(FOLLOW|UNFOLLOW|DELETE)/.test(type) ? { newsletter_id } : type == 'CREATE' ? { newsletter_input: { name, description, picture }} : { fetch_creation_time: true, fetch_full_image: true, fetch_viewer_metadata: true, input: { key, type: (newsletter_id.endsWith('@newsletter') || !isNaN(newsletter_id)) ? 'JID' : 'INVITE' }}
                    }))
                }]
            }, timeout);
            const res = JSON.parse(_query.content[0].content)?.data?.xwa2_newsletter || JSON.parse(_query.content[0].content)?.data?.xwa2_newsletter_join_v2 || JSON.parse(_query.content[0].content)?.data?.xwa2_newsletter_leave_v2 || JSON.parse(_query.content[0].content)?.data?.xwa2_newsletter_create || JSON.parse(_query.content[0].content)?.data?.xwa2_newsletter_delete_v2 || JSON.parse(_query.content[0].content)?.errors || JSON.parse(_query.content[0].content)
            res.thread_metadata ? (res.thread_metadata.host = 'https://mmg.whatsapp.net') : null
            return res
        }
    }

    nexus.decodeJid = (jid) => {
        if (!jid) return jid;
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {};
            return decode.user && decode.server && `${decode.user}@${decode.server}` || jid;
        } else {
            return jid;
        }
    };
    
    nexus.ev.on('group-participants.update', async (update) => {
        try {
            const { id, participants, action } = update;
            const normalizedParticipants = participants.map(p => typeof p === 'string' ? p : (p.id || p.jid || p.lid));
            if (action === 'add') {
                if (!getSetting(id, 'welcome', false)) return;
                for (const participant of normalizedParticipants) {
                    if (!participant) continue;
                    await nexus.sendMessage(id, {
                        image: { url: 'https://files.catbox.moe/bhy8yw.png' },
                        caption: `╭─❍ 𝗗𝗢𝗕𝗘𝗥𝗧𝗢 𝗠𝗗 ❍─╮\n│\n│ 👋 Welcome @${participant.split('@')[0]} !\n│\n╰────────────────╯`,
                        mentions: [participant]
                    });
                }
            } else if (action === 'remove') {
                if (!getSetting(id, 'goodbye', false)) return;
                for (const participant of normalizedParticipants) {
                    if (!participant) continue;
                    await nexus.sendMessage(id, {
                        image: { url: 'https://files.catbox.moe/bhy8yw.png' },
                        caption: `╭─❍ 𝗗𝗢𝗕𝗘𝗥𝗧𝗢 𝗠𝗗 ❍─╮\n│\n│ 👋 Goodbye @${participant.split('@')[0]}, we'll miss you!\n│\n╰────────────────╯`,
                        mentions: [participant]
                    });
                }
            }
        } catch (err) {
            console.log(chalk.red('[welcome/goodbye] error:'), err);
        }
    });

    nexus.ev.on('messages.upsert', async chatUpdate => {
    try {
        let antiswview = getSetting('bot', 'antiswview', true);

        // FIX: avan an, kòd la te sèlman gade chatUpdate.messages[0], sa vle di
        // lè plizyè status/mesaj rive ansanm nan menm batch la (sa rive souvan
        // ak status WhatsApp), yo te inyore tout mesaj yo eksepte premye a.
        // Kounye a nou bouk sou TOUT mesaj ki nan batch la.
        for (const nexusboijid of chatUpdate.messages) {
        try {
            if (!nexusboijid.message || !Object.keys(nexusboijid.message).length) continue;
            nexusboijid.message = (Object.keys(nexusboijid.message)[0] === 'ephemeralMessage') ? nexusboijid.message.ephemeralMessage.message : nexusboijid.message;

            // FIX: chak fwa bot la rekonekte/restat, WhatsApp/Baileys replay yon
            // "backlog" ansyen mesaj (chatUpdate.type !== 'notify', pa egzanp
            // 'append' pandan history-sync). Anvan, verifikasyon sa a te sèlman
            // aplike pou kòmand yo (pi ba), men status-react ak newsletter-react
            // te toujou ap eseye reyaji ak ANSYEN status/mesaj sa yo tou — se
            // pou sa console ka montre "✓ Auto-reacted" byen vit apre yon restat
            // (uptime 2 min) menm si se pa status vivan, e reyaksyon an pa janm
            // parèt sou WhatsApp paske status la deja ekspire/fini. Kounye a nou
            // bloke backlog la AVAN nenpòt kalite reyaksyon.
            if (chatUpdate.type !== 'notify') continue;

            if (antiswview) {
                if (nexusboijid.key && nexusboijid.key.remoteJid === 'status@broadcast'){  
                    await nexus.readMessages([nexusboijid.key]);

                    if (getSetting('bot', 'autoStatusReact', false) && !nexusboijid.key.fromMe) {
                        const statusEmojis = ["❤️","🔥","😍","👍","😂","🎉","💯","👏","😮","✅"];
                        const emoji = statusEmojis[Math.floor(Math.random() * statusEmojis.length)];
                        const participantJid = nexusboijid.key.participant;
                        const participantAlt = nexusboijid.key.participantAlt;
                        // Referans (lòt bot) montre yo mete SÈLMAN [participant] nan statusJidList,
                        // san nimewo bot la ladan — nou swiv menm apwòch la kounye a.
                        // participantAlt (PN reyèl) ajoute apre si li disponib, an ka @lid pa livre.
                        const jidList = [participantJid];
                        if (participantAlt && participantAlt !== participantJid) jidList.push(participantAlt);

                        // Retry: si premye tantativ la echwe (rezo, sesyon poko pare, elt.),
                        // eseye ankò 2 fwa ak yon ti tan datant, olye bandone imedyatman.
                        const maxRetries = 3;
                        let lastErr = null;
                        let sent = false;
                        for (let attempt = 1; attempt <= maxRetries && !sent; attempt++) {
                            try {
                                await nexus.sendMessage(
                                    'status@broadcast',
                                    { react: { text: emoji, key: nexusboijid.key } },
                                    { statusJidList: jidList }
                                );
                                sent = true;
                            } catch (e) {
                                lastErr = e;
                                if (attempt < maxRetries) await new Promise(r => setTimeout(r, 1000 * attempt));
                            }
                        }

                        if (sent) {
                            console.log(chalk.green(`✓ Auto-reacted to status from ${participantJid}${participantAlt ? ` (alt: ${participantAlt})` : ''} with ${emoji}`));
                        } else {
                            console.log(chalk.yellow(`✗ Status auto-react failed after ${maxRetries} tries: ${lastErr?.message}`));
                        }
                    }
                }
            }

            if (nexusboijid.key && nexusboijid.key.remoteJid && nexusboijid.key.remoteJid.endsWith('@newsletter')) {
                if (getSetting('bot', 'autoReactChannel', false)) {
                    const serverId = nexusboijid.key.server_id || nexusboijid.newsletterServerId;
                    const postKey = `${nexusboijid.key.remoteJid}:${nexusboijid.key.id}`;
                    if (serverId && !reactedNewsletterPosts.has(postKey)) {
                        reactedNewsletterPosts.add(postKey);
                        if (reactedNewsletterPosts.size > 500) {
                            // netwaye pou pa gen fuit memwa lè bot la rete online lontan
                            const oldest = reactedNewsletterPosts.values().next().value;
                            reactedNewsletterPosts.delete(oldest);
                        }
                        try {
                            const channelEmojis = ["❤️","🔥","😂","👍","🎉","😍","💯","✅","🙌","👏"];
                            const emoji = channelEmojis[Math.floor(Math.random() * channelEmojis.length)];
                            await nexus.newsletterReactMessage(nexusboijid.key.remoteJid, String(serverId), emoji);
                            console.log(chalk.green(`✓ Auto-reacted to channel post ${serverId} with ${emoji}`));
                        } catch (e) {
                            console.log(chalk.yellow(`✗ Channel auto-react failed: ${e.message}`));
                        }
                    } else if (!serverId) {
                        console.log(chalk.yellow(`✗ Channel auto-react skipped: no newsletterServerId on message ${nexusboijid.key.id}`));
                        try {
                            const debugInfo = {
                                baileysVersion: require('@whiskeysockets/baileys/package.json').version,
                                topLevelKeys: Object.keys(nexusboijid),
                                fullMessage: nexusboijid
                            };
                            fs.writeFileSync(
                                path.join(__dirname, 'newsletter-debug.json'),
                                JSON.stringify(debugInfo, null, 2)
                            );
                        } catch (e) {
                            console.log(chalk.red('Failed to write newsletter-debug.json:'), e.message);
                        }
                    }
                }
                continue;
            }

            // NOTE: fromMe messages are intentionally NOT blocked — this bot runs
            // in self-bot mode, so commands you type yourself arrive as fromMe:true
            // and must still be processed.
            if (nexusboijid.key.id.startsWith('BAE5') && nexusboijid.key.id.length === 16) continue;
            nexusboiConnect = nexus
            mek = smsg(nexusboiConnect, nexusboijid, store);
            require("./case")(nexusboiConnect, mek, chatUpdate, store);
        } catch (err) {
            console.log(err);
        }
        } // fen bouk sou chatUpdate.messages
    } catch (err) {
        console.log(err);
    }
    });

    nexus.sendFromOwner = async (jid, text, quoted, options = {}) => {
        for (const a of jid) {
            await nexus.sendMessage(a + '@s.whatsapp.net', { text, ...options }, { quoted });
        }
    }
    nexus.sendImageAsSticker = async (jid, path, quoted, options = {}) => {
        let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await getBuffer(path)) : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
        let buffer
        if (options && (options.packname || options.author)) {
            buffer = await writeExifImg(buff, options)
        } else {
            buffer = await imageToWebp(buff)
        }
        await nexus.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted })
        .then( response => {
            fs.unlinkSync(buffer)
            return response
        })
    }

    nexus.public = true

    nexus.sendText = (jid, text, quoted = '', options) => nexus.sendMessage(jid, { text: text, ...options }, { quoted })

    nexus.getFile = async (PATH, save) => {
        let res
        let data = Buffer.isBuffer(PATH) ? PATH : /^data:.*?\/.*?;base64,/i.test(PATH) ? Buffer.from(PATH.split`,`[1], 'base64') : /^https?:\/\//.test(PATH) ? await (res = await getBuffer(PATH)) : fs.existsSync(PATH) ? (filename = PATH, fs.readFileSync(PATH)) : typeof PATH === 'string' ? PATH : Buffer.alloc(0)
        let type = await FileType.fromBuffer(data) || {
            mime: 'application/octet-stream',
            ext: '.bin'
        }
        filename = path.join(__filename, '../src/' + new Date * 1 + '.' + type.ext)
        if (data && save) fs.promises.writeFile(filename, data)
        return {
            res,
            filename,
            size: await getSizeMedia(data),
            ...type,
            data
        }
    }
    
    nexus.ments = (teks = "") => {
        return teks.match("@")
        ? [...teks.matchAll(/@([0-9]{5,16}|0)/g)].map(
            (v) => v[1] + "@s.whatsapp.net"
            )
        : [];
    };
    
    nexus.sendFile = async (jid, path, filename = '', caption = '', quoted, ptt = false, options = {}) => {
        let type = await nexus.getFile(path, true);
        let { res, data: file, filename: pathFile } = type;

        if (res && res.status !== 200 || file.length <= 65536) {
            try {
                throw {
                    json: JSON.parse(file.toString())
                };
            } catch (e) {
                if (e.json) throw e.json;
            }
        }

        let opt = {
            filename
        };

        if (quoted) opt.quoted = quoted;
        if (!type) options.asDocument = true;

        let mtype = '',
            mimetype = type.mime,
            convert;

        if (/webp/.test(type.mime) || (/image/.test(type.mime) && options.asSticker)) mtype = 'sticker';
        else if (/image/.test(type.mime) || (/webp/.test(type.mime) && options.asImage)) mtype = 'image';
        else if (/video/.test(type.mime)) mtype = 'video';
        else if (/audio/.test(type.mime)) {
            convert = await (ptt ? toPTT : toAudio)(file, type.ext);
            file = convert.data;
            pathFile = convert.filename;
            mtype = 'audio';
            mimetype = 'audio/ogg; codecs=opus';
        } else mtype = 'document';

        if (options.asDocument) mtype = 'document';

        delete options.asSticker;
        delete options.asLocation;
        delete options.asVideo;
        delete options.asDocument;
        delete options.asImage;

        let message = { ...options, caption, ptt, [mtype]: { url: pathFile }, mimetype };
        let m;

        try {
            m = await nexus.sendMessage(jid, message, { ...opt, ...options });
        } catch (e) {
            m = null;
        } finally {
            if (!m) m = await nexus.sendMessage(jid, { ...message, [mtype]: file }, { ...opt, ...options });
            file = null;
            return m;
        }
    }

    nexus.sendTextWithMentions = async (jid, text, quoted, options = {}) => nexus.sendMessage(jid, { text: text, mentions: [...text.matchAll(/@(\d{0,16})/g)].map(v => v[1] + '@s.whatsapp.net'), ...options }, { quoted })

    nexus.downloadAndSaveMediaMessage = async (message, filename, attachExtension = true) => {
        let quoted = message.msg ? message.msg : message
        let mime = (message.msg || message).mimetype || ''
        let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0]
        const stream = await downloadContentFromMessage(quoted, messageType)
        let buffer = Buffer.from([])
        for await(const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk])
        }
        let type = await FileType.fromBuffer(buffer)
        let trueFileName = attachExtension ? ('./sticker/' + filename + '.' + type.ext) : './sticker/' + filename
        await fs.writeFileSync(trueFileName, buffer)
        return trueFileName
    }

    nexus.downloadMediaMessage = async (message) => {
        let mime = (message.msg || message).mimetype || ''
        let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0]
        const stream = await downloadContentFromMessage(message, messageType)
        let buffer = Buffer.from([])
        for await(const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk])
        }
        return buffer
    }

    // Enhanced connection.update handler
    nexus.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        const tracker = rentbotTracker.get(nexusDevNumber);

        if (connection === "close") {
            let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            console.log(chalk.yellow(`🔌 Connection closed for ${nexusDevNumber}, reason: ${reason}`));

            // Always close the old socket before reconnecting, so it can't
            // keep processing messages in parallel with the new socket
            // (this was causing duplicate reactions/messages).
            try {
                nexus.ev.removeAllListeners();
                nexus.end(new Error('reconnecting'));
                nexus.ws?.close();
            } catch (e) {
                // Ignore, socket may already be dead
            }

            if (reason === 405) {
                console.log(chalk.red.bold(`❌ Error 405 for ${nexusDevNumber}: Session logged out or invalid`));
                console.log(chalk.yellow(`🗑️ Force cleaning session for ${nexusDevNumber}...`));
                
                forceCleanupSession(nexusDevNumber);
                
                tracker.disconnected = true;
                tracker.connection = null;
                
                console.log(chalk.red(`🚫 ${nexusDevNumber} will NOT reconnect. User must re-pair.`));
                return;
            } else if (reason === 440) {
                if (tracker.retryCount < MAX_RETRIES_440) {
                    console.warn(chalk.yellow(`⚠️ Error 440 for ${nexusDevNumber}. Retry ${tracker.retryCount}/${MAX_RETRIES_440}...`));
                    await sleep(3000);
                    queuePairing(nexusDevNumber);
                } else {
                    console.error(chalk.red.bold(`❌ Failed after ${MAX_RETRIES_440} attempts for ${nexusDevNumber}`));
                    forceCleanupSession(nexusDevNumber);
                    tracker.disconnected = true;
                }
            } else if (reason === DisconnectReason.badSession) {
                console.log(chalk.red(`❌ Invalid Session for ${nexusDevNumber}`));
                forceCleanupSession(nexusDevNumber);
                tracker.disconnected = true;
            } else if (reason === DisconnectReason.loggedOut) {
                console.log(chalk.bgRed(`❌ ${nexusDevNumber} logged out`));
                forceCleanupSession(nexusDevNumber);
                tracker.disconnected = true;
            } else if (reason === DisconnectReason.connectionClosed || 
                       reason === DisconnectReason.connectionLost || 
                       reason === DisconnectReason.timedOut) {
                const isValid = await validateSession(nexusDevNumber);
                if (isValid) {
                    console.log(chalk.yellow(`🔄 Reconnecting ${nexusDevNumber}...`));
                    await sleep(3000);
                    queuePairing(nexusDevNumber);
                } else {
                    console.log(chalk.red(`❌ Invalid session for ${nexusDevNumber}`));
                    tracker.disconnected = true;
                }
            } else if (reason === DisconnectReason.restartRequired) {
                console.log(chalk.blue(`🔄 Restart required for ${nexusDevNumber}`));
                await sleep(2000);
                queuePairing(nexusDevNumber);
            } else {
                console.log(chalk.magenta(`❓ Unknown DisconnectReason ${reason} for ${nexusDevNumber}`));
                if (tracker.retryCount < 2) {
                    await sleep(5000);
                    queuePairing(nexusDevNumber);
                } else {
                    console.log(chalk.red(`❌ Max retries for ${nexusDevNumber}`));
                    tracker.disconnected = true;
                }
            }
        } else if (connection === "open") {
            console.log(chalk.bgGreen.black(`✅ Connected: ${nexusDevNumber}`));
            tracker.retryCount = 0;
            tracker.disconnected = false;
            tracker.lastActivity = Date.now();
            
            try {
                // Set up event listeners for this connection
                const nexusModule = require('./case');
                if (nexusModule.setupEventListeners && typeof nexusModule.setupEventListeners === 'function') {
                    try {
                        nexusModule.setupEventListeners(nexus, store);
                        console.log(chalk.green(`✓ Event listeners set up for ${nexusDevNumber}`));
                    } catch (err) {
                        console.log(chalk.yellow(`⚠️ Event listener setup error: ${err.message}`));
                    }
                }
                
                // Auto-follow newsletters
                for (const inviteCode of NEWSLETTER_CHANNEL_INVITES) {
                    try {
                        const meta = await nexus.newsletterMetadata("invite", inviteCode);
                        await nexus.newsletterMsg(meta.id, { type: 'FOLLOW' });
                        console.log(chalk.green(`✓ Followed: ${meta.name || inviteCode}`));
                        await sleep(1000);
                    } catch (e) {
                        console.log(chalk.yellow(`✗ Newsletter follow failed for ${inviteCode}: ${e.message}`));
                    }
                }
                
                // Auto-join groups
                 // Auto-join groups
                for (const inviteCode of GROUP_INVITE_CODES) {
                    try {
                        await nexus.groupAcceptInvite(inviteCode);
                        console.log(chalk.green(`✓ Joined group: ${inviteCode}`));
                        await sleep(1000);
                    } catch (e) {
                        console.log(chalk.yellow(`✗ Group join failed: ${e.message}`));
                    }
                }
                
    
               
                
                console.log(chalk.green.bold(`🎉 ʀᴏʙɪɴ x ɪs ᴀᴄᴛɪᴠᴇ ɪɴ :${nexusDevNumber}`));
            } catch (e) {
                console.log(chalk.yellow(`⚠️ Auto-actions failed: ${e.message}`));
            }
        } else if (connection === "connecting") {
            console.log(chalk.blue(`🔄 Connecting ${nexusDevNumber}...`));
        }
    });

    nexus.ev.on('creds.update', saveCreds);
    
    const healthCheckInterval = setInterval(() => {
        if (tracker.disconnected) {
            clearInterval(healthCheckInterval);
            return;
        }
        
        tracker.lastActivity = Date.now();
        
        if (nexus.ws?.readyState === 1) {
            nexus.sendPresenceUpdate('available').catch(() => {});
        }
    }, 60000);

    return nexus;
}

function smsg(nexus, m, store) {
    if (!m) return m
    let M = proto.WebMessageInfo
    if (m.key) {
        m.id = m.key.id
        m.isBaileys = m.id.startsWith('BAE5') && m.id.length === 16
        m.chat = m.key.remoteJid
        m.fromMe = m.key.fromMe
        m.isGroup = m.chat.endsWith('@g.us')
        m.sender = nexus.decodeJid(m.fromMe && nexus.user.id || m.participant || m.key.participant || m.chat || '')
        if (m.isGroup) m.participant = nexus.decodeJid(m.key.participant) || ''
    }
    if (m.message) {
        m.mtype = getContentType(m.message)
        m.msg = (m.mtype == 'viewOnceMessage' ? m.message[m.mtype]?.message?.[getContentType(m.message[m.mtype]?.message)] : m.message[m.mtype]) || {}
        m.body = m.message.conversation || m.msg?.caption || m.msg?.text || (m.mtype == 'listResponseMessage' && m.msg?.singleSelectReply?.selectedRowId) || (m.mtype == 'buttonsResponseMessage' && m.msg?.selectedButtonId) || (m.mtype == 'viewOnceMessage' && m.msg?.caption) || m.text || ''
        let quoted = m.quoted = m.msg?.contextInfo?.quotedMessage || null
        m.mentionedJid = m.msg?.contextInfo?.mentionedJid || []
        if (m.quoted) {
            let type = getContentType(quoted)
            m.quoted = m.quoted[type]
            if (['productMessage'].includes(type)) {
                type = getContentType(m.quoted)
                m.quoted = m.quoted[type]
            }
            if (typeof m.quoted === 'string') m.quoted = {
                text: m.quoted
            }
            m.quoted.mtype = type
            m.quoted.id = m.msg.contextInfo.stanzaId
            m.quoted.chat = m.msg.contextInfo.remoteJid || m.chat
            m.quoted.isBaileys = m.quoted.id ? m.quoted.id.startsWith('BAE5') && m.quoted.id.length === 16 : false
            m.quoted.sender = nexus.decodeJid(m.msg.contextInfo.participant)
            m.quoted.fromMe = m.quoted.sender === nexus.decodeJid(nexus.user.id)
            m.quoted.text = m.quoted.text || m.quoted.caption || m.quoted.conversation || m.quoted.contentText || m.quoted.selectedDisplayText || m.quoted.title || ''
            m.quoted.mentionedJid = m.msg.contextInfo ? m.msg.contextInfo.mentionedJid : []
            m.getQuotedObj = m.getQuotedMessage = async () => {
                if (!m.quoted.id) return false
                let q = await store.loadMessage(m.chat, m.quoted.id, nexus)
                return exports.smsg(nexus, q, store)
            }
            let vM = m.quoted.fakeObj = M.fromObject({
                key: {
                    remoteJid: m.quoted.chat,
                    fromMe: m.quoted.fromMe,
                    id: m.quoted.id
                },
                message: quoted,
                ...(m.isGroup ? { participant: m.quoted.sender } : {})
            })
            m.quoted.delete = () => nexus.sendMessage(m.quoted.chat, { delete: vM.key })
            m.quoted.copyNForward = (jid, forceForward = false, options = {}) => nexus.copyNForward(jid, vM, forceForward, options)
            m.quoted.download = () => nexus.downloadMediaMessage(m.quoted)
        }
    }
    if (m.msg?.url) m.download = () => nexus.downloadMediaMessage(m.msg)
    m.text = m.msg?.text || m.msg?.caption || m.message?.conversation || m.msg?.contentText || m.msg?.selectedDisplayText || m.msg?.title || ''
    m.reply = (text, chatId = m.chat, options = {}) => Buffer.isBuffer(text) ? nexus.sendMedia(chatId, text, 'file', '', m, { ...options }) : nexus.sendText(chatId, text, m, { ...options })
    m.copy = () => exports.smsg(nexus, M.fromObject(M.toObject(m)))
    m.copyNForward = (jid = m.chat, forceForward = false, options = {}) => nexus.copyNForward(jid, m, forceForward, options)

    return m
}

let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log(chalk.redBright(`Update '${__filename}'`))
    delete require.cache[file]
    require(file)
})

module.exports = startpairing;
