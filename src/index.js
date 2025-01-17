require("dotenv").config();
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const path = require("path");
const commands = require("./commands"); // Import commands.js
const { MongoClient } = require("mongodb");

// Verify the MongoDB URI
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error("MONGODB_URI is not defined in the environment variables.");
  process.exit(1);
}

// Initialize MongoDB client
const mongoClient = new MongoClient(mongoUri);

let db;
mongoClient
  .connect()
  .then((client) => {
    db = client.db("clashofclans");
    console.log("Connected to MongoDB successfully in Index File. 🎉");

    // Initialize WhatsApp client with LocalAuth
    const whatsappClient = new Client({
      authStrategy: new LocalAuth(),
    });

    // Set to keep track of allowed chats
    let allowedChats = new Set();

    // Function to load allowed chats from MongoDB
    const loadAllowedChats = async () => {
      if (!db) {
        console.error("Database not initialized.");
        return [];
      }
      const collection = db.collection("allowedChats");
      const document = await collection.findOne({ _id: "allowedChats" });
      return document?.chats || [];
    };

    // Function to save allowed chats to MongoDB
    const saveAllowedChats = async (allowedChats) => {
      if (!db) {
        console.error("Database not initialized.");
        return;
      }
      const collection = db.collection("allowedChats");
      await collection.updateOne(
        { _id: "allowedChats" },
        { $set: { chats: Array.from(allowedChats) } },
        { upsert: true }
      );
    };

    // Generate and display QR code for login
    whatsappClient.on("qr", (qr) => {
      qrcode.generate(qr, { small: true });
      console.log("QR code generated, scan it with your WhatsApp app.");
    });

    // Event listener for successful authentication
    whatsappClient.on("ready", async () => {
      console.log("Client is ready!");
      allowedChats = new Set(await loadAllowedChats());
    });

    // Function to allow a chat ID
    async function allowChat(chatId) {
      allowedChats.add(chatId);
      await saveAllowedChats(allowedChats);
      const chat = await whatsappClient.getChatById(chatId);
      chat.sendMessage("Welcome! You're now allowed to interact with me.");
    }

    // Function to stop allowing a chat ID
    async function stopChat(chatId) {
      allowedChats.delete(chatId);
      await saveAllowedChats(allowedChats);
      const chat = await whatsappClient.getChatById(chatId);
      chat.sendMessage("You are no longer allowed to interact with me.");
    }

    // Event listener for incoming messages
    whatsappClient.on("message", async (message) => {
      const chat = await message.getChat();
      const adminChatId = "120363370354490104@g.us";

      // Normalize message body to lowercase
      const normalizedMessage = message.body.toLowerCase();

      if (normalizedMessage === "!info") {
        let info;
        if (chat.isGroup) {
          info = `
            *User Info*
            Name: ${chat.name}
            ID: ${chat.id._serialized}
            Phone Number: ${chat.id._serialized.split("@")[0]}
          `;
        } else {
          info = `
            *User Info*
            Name: ${message._data.notifyName}
            ID: ${message.from}
            Phone Number: ${message.from.split("@")[0]}
          `;
        }
        message.reply(info);
      } else if (chat.id._serialized === adminChatId) {
        if (normalizedMessage.startsWith("!allow ")) {
          const chatId = message.body.split(" ")[1];
          await allowChat(chatId);
          message.reply(`Chat ID ${chatId} is now allowed.`);
        } else if (normalizedMessage.startsWith("!stop ")) {
          const chatId = message.body.split(" ")[1];
          await stopChat(chatId);
          message.reply(`Chat ID ${chatId} is no longer allowed.`);
        } else if (normalizedMessage === "!ping") {
          message.reply("pong");
        } else if (normalizedMessage === "!help") {
          const helpMessage = `
            *Available Commands*
            !allow <chatId> - Allow a chat ID to interact with the bot
            !stop <chatId> - Stop allowing a chat ID to interact with the bot
            !ping - Check if the bot is responsive
            !info - Get user information
            !help - List all available commands
          `;
          const sentMessage = await message.reply(helpMessage);

          // Schedule deletion of the help message after 30 seconds
          setTimeout(async () => {
            try {
              await sentMessage.delete(true); // Delete the message for everyone
            } catch (error) {
              console.error("Failed to delete the message:", error);
            }
          }, 30000); // 30 seconds in milliseconds
        }
      } else if (normalizedMessage === "!help") {
        const helpMessage = `
          *Available Commands*
          !ping - Check if the bot is responsive
          !info - Get user information
          !help - List all available commands
        `;
        const sentMessage = await message.reply(helpMessage);

        // Schedule deletion of the help message after 30 seconds
        setTimeout(async () => {
          try {
            await sentMessage.delete(true); // Delete the message for everyone
          } catch (error) {
            console.error("Failed to delete the message:", error);
          }
        }, 30000); // 30 seconds in milliseconds
      } else {
        // Execute commands from commands.js
        if (message.body.startsWith("!")) {
          const commandName = message.body.split(" ")[0].substring(1); // Assuming command starts with '!'
          const args = message.body.split(" ").slice(1);

          if (commands[commandName]) {
            try {
              await commands[commandName](message, args);
            } catch (error) {
              console.error(`Error executing command "${commandName}":`, error);
              message.reply("An error occurred while executing the command.");
            }
            return; // Exit the function to prevent further processing
          }
        }
      }
    });

    // Start the client
    whatsappClient.initialize();
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1);
  });
