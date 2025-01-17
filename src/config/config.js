const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");

// Initialize WhatsApp client with LocalAuth
const client = new Client({
  authStrategy: new LocalAuth(),
});

// Initialize Google Generative AI
const genAI = new GoogleGenerativeAI("AIzaSyBP0BTKp97HpdOZE-XCVEQP5XhaCTGtSxc");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Set to keep track of allowed chats
const allowedChats = new Set();
const allowedChatsFilePath = path.join(__dirname, "allowedChats.txt");

// Load allowed chats from file
if (fs.existsSync(allowedChatsFilePath)) {
  const data = fs.readFileSync(allowedChatsFilePath, "utf8");
  data.split("\n").forEach((line) => {
    if (line.trim()) {
      allowedChats.add(line.trim());
    }
  });
}

// Generate and display QR code for login
client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
  console.log("QR code generated, scan it with your WhatsApp app.");
});

// Event listener for successful authentication
client.on("ready", () => {
  console.log("Client is ready!");
});

// Function to allow a chat ID
async function allowChat(chatId) {
  allowedChats.add(chatId);
  fs.appendFileSync(allowedChatsFilePath, `${chatId}\n`);
  const chat = await client.getChatById(chatId);
  chat.sendMessage("Welcome! You're now allowed to interact with me.");
}

// Function to stop allowing a chat ID
function stopChat(chatId) {
  allowedChats.delete(chatId);
  const updatedChats = Array.from(allowedChats).join("\n");
  fs.writeFileSync(allowedChatsFilePath, updatedChats);
}

// Event listener for incoming messages
client.on("message", async (message) => {
  const chat = await message.getChat();
  const adminChatId = "120363370354490104@g.us";

  if (message.body === "!info") {
    const info = `
      *User Info*
      Name: ${message.from}
      ID: ${message.id._serialized}
      Phone Number: ${message.from.split("@")[0]}
    `;
    message.reply(info);
  } else if (chat.id._serialized === adminChatId) {
    if (message.body.startsWith("!Allow ")) {
      const chatId = message.body.split(" ")[1];
      await allowChat(chatId);
      message.reply(`Chat ID ${chatId} is now allowed.`);
    } else if (message.body.startsWith("!Stop ")) {
      const chatId = message.body.split(" ")[1];
      stopChat(chatId);
      message.reply(`Chat ID ${chatId} is no longer allowed.`);
    } else if (message.body === "!ping") {
      message.reply("pong");
    } else if (message.body === "!help") {
      const helpMessage = `
        *Available Commands*
        !Allow <chatId> - Allow a chat ID to interact with the bot
        !Stop <chatId> - Stop allowing a chat ID to interact with the bot
        !ping - Check if the bot is responsive
        !info - Get user information
        !help - List all available commands
      `;
      const sentMessage = await message.reply(helpMessage);
      setTimeout(() => {
        sentMessage.delete(true);
      }, 30000); // Delete message after 30 seconds
    } else if (allowedChats.has(chat.id._serialized)) {
      const prompt = message.body;
      const result = await model.generateContent(prompt);
      message.reply(result.response.text());
    }
  } else if (allowedChats.has(chat.id._serialized)) {
    if (message.body === "!ping") {
      message.reply("pong");
    } else if (message.body === "!help") {
      const helpMessage = `
        *Available Commands*
        !ping - Check if the bot is responsive
        !info - Get user information
        !help - List all available commands
      `;
      const sentMessage = await message.reply(helpMessage);
      setTimeout(() => {
        sentMessage.delete(true);
      }, 30000); // Delete message after 30 seconds
    } else {
      const prompt = message.body;
      const result = await model.generateContent(prompt);
      message.reply(result.response.text());
    }
  }
});

// Start the client
client.initialize();
