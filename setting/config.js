const fs = require('fs')

global.owner = "19713836288" //owner number
global.footer = "𝗗𝗢𝗕𝗘𝗥𝗧𝗢 𝗠𝗗" //footer section
global.status = true //"self/public" section of the bot
global.prefa = ['.','🇭🇹']
global.owner = ['19713836288']
global.xprefix = '.'
global.gambar = "https://files.catbox.moe/i5nsfz.jpg"
global.OWNER_NAME = "𝗗𝗢𝗕𝗘𝗥𝗧𝗢 𝗗𝗘𝗩" //
global.DEVELOPER = ["8612224670"] //
global.BOT_NAME = "𝗗𝗢𝗕𝗘𝗥𝗧𝗢 𝗠𝗗"
global.bankowner = "𝗗𝗢𝗕𝗘𝗥𝗧𝗢 𝗗𝗘𝗩"
global.creatorName = "𝗗𝗘𝗩𝗘𝗟𝗢𝗣𝗘𝗥 𝗗𝗢𝗕𝗘𝗥𝗧𝗢"
global.ownernumber = '19713836288'  //creator number
global.antilink = true / false
global.location = "Cameroon,Douala"
global.prefa = ['.','🇭🇹']
//================DO NOT CHANGE OR YOU'LL GET AN ERROR=============\
global.footer = "𝗗𝗢𝗕𝗘𝗥𝗧𝗢 𝗠𝗗" //footer section
global.link = "https://www.youtube.com/@druzz_dev1"
global.autobio = true//auto update bio
global.botName = "𝗗𝗢𝗕𝗘𝗥𝗧𝗢 𝗠𝗗"
global.version = "2.0.0"
global.botname = "𝗗𝗢𝗕𝗘𝗥𝗧𝗢 𝗠𝗙"
global.author = "𝗗𝗢𝗕𝗘𝗥𝗧𝗢 𝗠𝗗"
global.themeemoji = '🤡'
global.wagc = 'https://chat.whatsapp.com/ER11OBKfECiJy6oWCErRKa'
global.thumbnail = 'https://files.catbox.moe/rqqcsj.jpg'
global.richpp = 'https://files.catbox.moe/i5nsfz.jpg'
global.packname = "𝗗𝗢𝗕𝗘𝗥𝗧𝗢 𝗠𝗗"
global.author = "\n\n\n\n\nCreated by 𝗗𝗢𝗕𝗘𝗥𝗧𝗢 𝗗𝗘𝗩\ntelegram : @druzzdev2"
global.creator = "50936135356@s.whatsapp.net"
global.ownername = '𝗗𝗢𝗕𝗘𝗥𝗧𝗢 𝗗𝗘𝗩' 
global.onlyowner = `*🚫 Only Owner*
`
  // reply 
global.database = `*🚫Only Database Users*`
  global.mess = {
wait: "*Wait*",
   success: "*Done✅*",
   on: "*𝗗𝗢𝗕𝗘𝗥𝗧𝗢 𝗠𝗗 is active*", 
   prem: "*🚫FOR PREMIUM USERS ONLY ADD YOUR NUMBER TO DATABASE TO ACCESS PREMIUM*", 
   off: "off",
   query: {
       text: "Where's the text?",
       link: "Where's the link?",
   },
   error: {
       fitur: "*🚫Sorry, bro, the feature has error. Please chat with the Bot Developer so it can be fixed immediately.*",
   },
   only: {
       group: "*🚫Sorry, This Feature Can Only Be Used In Groups only*",
private: "*🚫Sorry, This Feature Can Only Be Used In Private Chats*",
       owner: "*🚫Sorry, This Feature Can Only Owner*",
       admin: " Sorry, this feature can only be used by Bot Admins",
       badmin: "Sorry, bro, It Looks Like You Can't Use This Feature Because the Bot is Not yet Group Admin",
       premium: "*🚫This feature is specifically for beloved Premium users*",
   }
}

global.hituet = 0
//false=disable and true=enable
global.autoRecording = true //auto recording
global.autoTyping = true //auto typing
global.autorecordtype = false //auto typing + recording
global.autoread = false //auto read messages
global.autobio = false //auto update bio
global.anti92 = false //auto block +92 
global.autoswview = true //auto view status/story

let file = require.resolve(__filename)
require('fs').watchFile(file, () => {
  require('fs').unwatchFile(file)
  console.log('\x1b[0;32m'+__filename+' \x1b[1;32mupdated!\x1b[0m')
  delete require.cache[file]
  require(file)
})
