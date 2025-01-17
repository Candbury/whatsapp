require("dotenv").config();
const { Client } = require("clashofclans.js");
const { createCanvas, loadImage } = require("canvas");
const { MessageMedia, MessageMentions } = require("whatsapp-web.js");
const path = require("path");
const { MongoClient } = require("mongodb");
const { performance } = require("perf_hooks");

// Initialize Clash of Clans API client
const cocClient = new Client();

// Log in to the Clash of Clans API client using environment variables
(async () => {
  try {
    await cocClient.login({
      email: process.env.COC_API_EMAIL,
      password: process.env.COC_API_PASSWORD,
    });
    console.log("Clash of Clans API client logged in successfully. 🎉");
  } catch (error) {
    console.error(
      "Failed to log in to Clash of Clans API:",
      error.code,
      error.message
    );
  }
})();

// Initialize MongoDB client
const mongoClient = new MongoClient(process.env.MONGODB_URI);

let db;
mongoClient
  .connect()
  .then((client) => {
    db = client.db("clashofclans");
    console.log("Connected to MongoDB successfully in commands.js. 🎉");
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1);
  });

// Function to get the database for a specific chat ID
const getChatDatabase = (chatID) => {
  return db.collection(`chat_${chatID}`);
};

// Function to save a user profile
const saveUserProfile = async (chatID, userProfile) => {
  const collection = getChatDatabase(chatID);
  await collection.updateOne(
    { userId: userProfile.userId },
    { $set: userProfile },
    { upsert: true }
  );
};

// Function to get a user profile
const getUserProfile = async (chatID, userId) => {
  const collection = getChatDatabase(chatID);
  const document = await collection.findOne({ userId: userId });
  return document || {};
};

// Function to link a player's tag to a user
const linkPlayerTag = async (chatID, userId, playerTag) => {
  const userProfile = await getUserProfile(chatID, userId);
  userProfile.playerTags = userProfile.playerTags || [];
  if (!userProfile.playerTags.includes(playerTag)) {
    userProfile.playerTags.push(playerTag);
    await saveUserProfile(chatID, { ...userProfile, userId });
    return `Linked your profile to player tag ${playerTag}.`;
  } else {
    return `Player tag ${playerTag} is already linked to your profile.`;
  }
};

// Function to link a clan's tag to a user
const linkClanTag = async (chatID, userId, clanTag) => {
  const userProfile = await getUserProfile(chatID, userId);
  userProfile.clanTags = userProfile.clanTags || [];
  if (!userProfile.clanTags.includes(clanTag)) {
    userProfile.clanTags.push(clanTag);
    await saveUserProfile(chatID, { ...userProfile, userId });
    return `Linked your profile to clan tag ${clanTag}.`;
  } else {
    return `Clan tag ${clanTag} is already linked to your profile.`;
  }
};

// Function to unlink a player's tag from a user
const unlinkPlayerTag = async (chatID, userId, playerTag) => {
  const userProfile = await getUserProfile(chatID, userId);
  userProfile.playerTags = userProfile.playerTags || [];
  userProfile.playerTags = userProfile.playerTags.filter(
    (tag) => tag !== playerTag
  );
  await saveUserProfile(chatID, { ...userProfile, userId });
};

// Function to unlink a clan's tag from a user
const unlinkClanTag = async (chatID, userId, clanTag) => {
  const userProfile = await getUserProfile(chatID, userId);
  userProfile.clanTags = userProfile.clanTags || [];
  userProfile.clanTags = userProfile.clanTags.filter((tag) => tag !== clanTag);
  await saveUserProfile(chatID, { ...userProfile, userId });
};

// Function to get a WhatsApp user ID from a mention
const getUserIdFromMention = (mention) => {
  const mentionedUsers = MessageMentions.parseMentions(mention);
  if (mentionedUsers.length > 0) {
    return mentionedUsers[0];
  }
  return null;
};

// Rate limiting configuration
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 3000; // 3 seconds
const MAX_REQUESTS_PER_WINDOW = 5;

/**
 * Checks if a user has exceeded the rate limit for sending commands.
 * @param {string} userId - The ID of the user sending the command.
 * @returns {boolean} - Returns true if the user is within the rate limit, false otherwise.
 */
const rateLimitCheck = (userId) => {
  const currentTime = Date.now();
  const userRequests = rateLimitMap.get(userId) || [];
  const filteredRequests = userRequests.filter(
    (timestamp) => currentTime - timestamp < RATE_LIMIT_WINDOW_MS
  );

  rateLimitMap.set(userId, [...filteredRequests, currentTime]);

  return filteredRequests.length < MAX_REQUESTS_PER_WINDOW;
};

// Localization messages
const messages = {
  en: {
    RATE_LIMIT_EXCEEDED:
      "⏳ You are sending commands too quickly. Please try again later.",
    INVALID_TAG: "🚫 Please provide a valid tag, e.g., `!clan #2PP`.",
    CLAN_INFO: (clan) => `
🏰 **Clan Name**: ${clan.name || "N/A"}
🏷️ **Clan Tag**: ${clan.tag || "N/A"}
📈 **Clan Level**: ${clan.level || "N/A"}
👥 **Members**: ${clan.members.length || "N/A"}/50
🏆 **War Wins**: ${clan.warWins || "N/A"}
🔥 **War Win Streak**: ${clan.warWinStreak || "N/A"}
🗓️ **War Frequency**: ${clan.warFrequency || "N/A"}
💯 **Clan Points**: ${clan.clanPoints || "N/A"}
💪 **Clan Versus Points**: ${clan.clanVersusPoints || "N/A"}
🏅 **Required Trophies**: ${clan.requiredTrophies || "N/A"}
📍 **Location**: ${clan.location ? clan.location.name : "N/A"}
    `,
    PLAYER_INFO: (player) => `
👤 **Player Name**: ${player.name || "N/A"}
🏷️ **Player Tag**: ${player.tag || "N/A"}
🏠 **Town Hall Level**: ${player.townHallLevel || "N/A"}
📈 **XP Level**: ${player.expLevel || "N/A"}
🏅 **Trophies**: ${player.trophies || "N/A"}
🏆 **Best Trophies**: ${player.bestTrophies || "N/A"}
⭐ **War Stars**: ${player.warStars || "N/A"}
⚔️ **Attack Wins**: ${player.attackWins || "N/A"}
🛡️ **Defense Wins**: ${player.defenseWins || "N/A"}
🏰 **Clan Role**: ${player.role || "N/A"}
🏰 **Clan**: ${player.clan ? player.clan.name : "N/A"}
🏆 **League**: ${player.league ? player.league.name : "N/A"}
🏠 **Builder Hall Level**: ${player.builderHallLevel || "N/A"}
🏅 **Versus Trophies**: ${player.versusTrophies || "N/A"}
🏆 **Best Versus Trophies**: ${player.bestVersusTrophies || "N/A"}
⚔️ **Versus Battle Wins**: ${player.versusBattleWins || "N/A"}
    `,
    ATTACK_INFO: (attacks) =>
      attacks
        .map(
          (attack, index) => `
      ${index + 1}. ⚔️ **Attack Details**:
      🏹 Attacker:  *#${attack.attacker.mapPosition}*--${
            attack.attacker.name || "N/A"
          } (${attack.attacker.tag || "N/A"})
      ⭐ Stars Achieved: ${attack.stars || "N/A"} on 🗺️*#${
            attack.defender.mapPosition
          }*-${attack.defender.name || "N/A"} (${attack.defender.tag || "N/A"})
      💥 Destruction: ${attack.destruction || "N/A"}%
      🗡️ Attack Order: ${attack.order || "N/A"}
      ⏳ Duration: ${attack.duration || "N/A"} seconds
      🔄 *Attacks Used:* ${attack.attacker.attacks.length || "N/A"}
      🆕 Fresh Attack: ${attack.isFresh ? "Yes" : "No"}
    `
        )
        .join("\n"),
    BEST_DEFENSE: (bestDefense) =>
      bestDefense
        ? `
        🛡️ **Best Defense**:
        - 🏹 Attacker: ${bestDefense.attacker.name || "N/A"} (${
            bestDefense.attacker.tag || "N/A"
          })
        - ⭐ Stars: ${bestDefense.stars || "N/A"}
        - 💥 Destruction: ${bestDefense.destruction || "N/A"}%
      `
        : "🛡️ **Best Defense**: No defenses yet",
    BEST_ATTACK: (bestAttack) =>
      bestAttack
        ? `
        ⚔️ **Best Attack**:
        - 🏹 Attacker: ${bestAttack.attacker.name || "N/A"} (${
            bestAttack.attacker.tag || "N/A"
          })
        - 🛡️ Defender: ${bestAttack.defender.name || "N/A"} (${
            bestAttack.defender.tag || "N/A"
          })
        - ⭐ Stars: ${bestAttack.stars || "N/A"}
        - 💥 Destruction: ${bestAttack.destruction || "N/A"}%
      `
        : "⚔️ **Best Attack**: No attacks yet",
    TEAM_INFO: (teamSize, completedAttacks, totalAttacks) => `
      🏰 **Team Size**: ${teamSize || "N/A"}
      ✅ **Total Completed Attacks**: ${completedAttacks || "N/A"}
      ❌ **Total Attacks Left**: ${totalAttacks - completedAttacks || "N/A"}
    `,
    NO_CURRENT_WAR: "No current war information available. ❌",
    ERROR_FETCH_ATTACK: "Error fetching attack information: ",

    MEMBERS_INFO_LIST: (members) => {
      if (!members || members.length === 0) {
        return "No members found in the clan. ❌";
      }

      let memberList = "**Clan Members**:\n";
      members.forEach((member, index) => {
        memberList +=
          `
        🏅 ${index + 1}.*${member.name || "Unknown"}*:
        ⭐ Role: ${member.role || "N/A"}
        🎖️ Level: ${member.expLevel || "N/A"}
        🏰 Town Hall Level: ${member.townHallLevel || "N/A"}
        🏆 Trophies: ${member.trophies || 0}
        📤 Donations: ${member.donations || 0}
        📥 Received: ${member.received || 0}
    `.trim() + "\n";
      });
      return memberList;
    },
    MEMBERS_INFO_TABLE: (members) => {
      if (!members || members.length === 0) {
        return "No members found in the clan. ❌";
      }

      let header = `#️⃣|🏅Name  |⭐Role  |🎖Level|🏰TH|🏆Trophies|📤Donations| Received
 -|----------------|---------|-----|------|---|----|--------
    `;
      let rows = members
        .map((member, index) => {
          return `${String(index + 1).padEnd(2)}| ${member.name.padEnd(
            15
          )}| ${member.role.padEnd(8)}| ${String(member.expLevel).padEnd(
            4
          )}| ${String(member.townHallLevel).padEnd(2)}| ${String(
            member.trophies
          ).padEnd(4)}| ${String(member.donations).padEnd(5)}| ${String(
            member.received
          ).padEnd(5)}`;
        })
        .join("\n");

      return `\`\`\`\n${header}${rows}\n\`\`\``;
    },
    WAR_LOG_INFO: (warLog) => {
      let warLogInfo = "📜 **Clan War Log**:\n";
      warLog.slice(0, 5).forEach((war) => {
        warLogInfo += `
  ⚔️ **War against ${war.opponent.name || "N/A"}**:
    - 🏆 Result: ${war.result || "N/A"}
    - ⭐ Stars: ${war.clan.stars || "N/A"} - ${war.opponent.stars || "N/A"}
    - ⚔️ Attacks: ${war.clan.attacks || "N/A"} - ${
          war.opponent.attacks || "N/A"
        }
    - 💥 Destruction: ${war.clan.destructionPercentage || "N/A"}% - ${
          war.opponent.destructionPercentage || "N/A"
        }%
    - 🎖️ Exp Earned: ${war.clan.expEarned || "N/A"}
          `;
      });
      return warLogInfo;
    },
    CAPITAL_INFO: (capital) => `
🏰 **Capital Hall Level**: ${capital.capitalHallLevel || "N/A"}
🏘️ **Districts**: ${
      capital.districts
        ? capital.districts
            .map(
              (district) =>
                `${district.name || "N/A"} (Level: ${
                  district.districtHallLevel || "N/A"
                })`
            )
            .join(", ")
        : "No districts available"
    }
    `,

    CAPITAL_RAID_SEASONS_INFO: (seasons) => {
      if (!seasons || seasons.length === 0) {
        return "No capital raid seasons available. ❌";
      }

      let raidSeasonsInfo = "📜 **Capital Raid Seasons**:\n";
      seasons.forEach((season) => {
        raidSeasonsInfo += `
        🏆 **State**: ${season.state || "N/A"}
        ⏱️ **Start Time**: ${
          new Date(season.startTime).toLocaleString() || "N/A"
        }
        ⏱️ **End Time**: ${new Date(season.endTime).toLocaleString() || "N/A"}
        💰 **Total Loot**: ${season.capitalTotalLoot || "N/A"}
        🔥 **Raids Completed**: ${season.raidsCompleted || "N/A"}
        ⚔️ **Total Attacks**: ${season.totalAttacks || "N/A"}
        🏰 **Enemy Districts Destroyed**: ${
          season.enemyDistrictsDestroyed || "N/A"
        }
        🎁 **Offensive Reward**: ${season.offensiveReward || "N/A"}
        🛡️ **Defensive Reward**: ${season.defensiveReward || "N/A"}
        `;
      });

      return raidSeasonsInfo;
    },

    LABELS_INFO: (labels) => {
      let labelsInfo = "**Clan Labels**:\n";
      labels.forEach((label) => {
        labelsInfo += `🏷️ **${label.name || "N/A"}**\n`;
      });
      return labelsInfo;
    },
    PING: (apiLatency, botLatency) => `
      🏓 Pong! Latency:
      - Clash of Clans API: ${apiLatency.toFixed(2)} ms
      - WhatsApp Bot: ${botLatency.toFixed(2)} ms
    `,
    HELP: `
**Available Commands:**
*Clan Information* 🏰

- *!clan* <tag>: Fetch general clan information.
- *!labels* <tag>: Fetch clan labels.
- *!capital* <tag>: Fetch clan capital information.
- *!compo* <tag>: Show townhall counts for the clan.

*Member Information* 👥

- *!members* <tag>: Fetch the clan members list.
- *!members* *table* <tag>: Fetch clan members in a table format.

*Player Information* 👤

- *!player* <tag>: Fetch detailed player information.

*Clan Wars* ⚔️

- *!war* <tag>: Fetch current clan war information.
- *!warlog* <tag>: Fetch clan war log.
- *!attack* <tag>: Fetch current war attack details.
- *!leftattack* <tag>: Fetch members who haven't completed their attacks.

*Utilities* ℹ️

- !ping: Check bot and API responsiveness.
- !help: Display this help message.
    `,
    BOT_INFO: `
**Bot Information**:
🛠️ - Version: 1.0.0
👨‍💻 - Developed by: *Cadbury*
📊 - Features: Fetch Clash of Clans data, provide war status, clan info, and more.
    `,
  },
  // Add more languages here
};

module.exports = {
  // Handles incoming messages and routes commands
  handleMessage: async (message) => {
    const normalizedMessage = message.body.toLowerCase();
    const args = normalizedMessage.split(" ");
    const command = args.shift();

    await handleCommand(normalizedMessage, message, args);
  },

  // Command to link a player's tag
  linkplayer: async (message, args) => {
    const chatID = message.from;
    const playerTag = args[0];
    if (!playerTag || !playerTag.startsWith("#")) {
      await message.reply(
        "Please provide a valid player tag, e.g., `!linkplayer #ABC123`."
      );
      return;
    }
    const userId = message.author || message.from;

    try {
      // Fetch the player information from the Clash of Clans API
      const player = await cocClient.getPlayer(playerTag);
      // Link the player tag to the user's profile in the database
      const response = await linkPlayerTag(chatID, userId, playerTag);
      // Reply with a confirmation message
      await message.reply(`${response} (${player.name}).`);
    } catch (error) {
      console.error("Error linking player tag:", error.code, error.message);
      await message.reply(`Error linking player tag: ${error.message} ❌`);
    }
  },

  // Command to link a clan's tag
  linkclan: async (message, args) => {
    const chatID = message.from;
    const clanTag = args[0];
    if (!clanTag || !clanTag.startsWith("#")) {
      await message.reply(
        "Please provide a valid clan tag, e.g., `!linkclan #ABC123`."
      );
      return;
    }
    const userId = message.author || message.from;

    try {
      // Fetch the clan information from the Clash of Clans API
      const clan = await cocClient.getClan(clanTag);
      // Link the clan tag to the user's profile in the database
      const response = await linkClanTag(chatID, userId, clanTag);
      // Reply with a confirmation message
      await message.reply(`${response} (${clan.name}).`);
    } catch (error) {
      console.error("Error linking clan tag:", error.code, error.message);
      await message.reply(`Error linking clan tag: ${error.message} ❌`);
    }
  },

  // Command to unlink all player's tags or a specific tag
  unlinkplayer: async (message, args) => {
    const chatID = message.from;
    const playerTag = args[0];
    const userId = message.author || message.from;
    if (!playerTag) {
      const userProfile = await getUserProfile(chatID, userId);
      userProfile.playerTags = [];
      await saveUserProfile(chatID, { ...userProfile, userId });
      await message.reply(`All player tags unlinked from your profile.`);
    } else {
      await unlinkPlayerTag(chatID, userId, playerTag);
      await message.reply(
        `Unlinked player tag ${playerTag} from your profile.`
      );
    }
  },

  // Command to unlink all clan's tags or a specific tag
  unlinkclan: async (message, args) => {
    const chatID = message.from;
    const clanTag = args[0];
    const userId = message.author || message.from;
    if (!clanTag) {
      const userProfile = await getUserProfile(chatID, userId);
      userProfile.clanTags = [];
      await saveUserProfile(chatID, { ...userProfile, userId });
      await message.reply(`All clan tags unlinked from your profile.`);
    } else {
      await unlinkClanTag(chatID, userId, clanTag);
      await message.reply(`Unlinked clan tag ${clanTag} from your profile.`);
    }
  },

  // Fetches and replies with detailed player information

  profile: async (message, args) => {
    const chatID = message.from;
    const mention = args[0];
    let userId = message.author || message.from;

    // Function to extract user ID from mention
    const getUserIdFromMention = (mention) => {
      const mentionedUsers = message.getMentions();
      return mentionedUsers.length > 0 ? mentionedUsers[0] : null;
    };

    // Determine the user ID based on mention or message author
    if (mention) {
      const mentionedUserId = getUserIdFromMention(mention);
      if (!mentionedUserId) {
        await message.reply("Invalid user mention.");
        return;
      }
      userId = mentionedUserId;
    }

    try {
      // Fetch user profile from the database
      const userProfile = await getUserProfile(chatID, userId);

      // Check if the user profile exists
      if (!userProfile) {
        await message.reply("No profile linked to this user.");
        return;
      }

      // Function to fetch clan details
      const fetchClanDetails = async (clanTags) => {
        const clanDetails = [];
        for (const tag of clanTags) {
          try {
            const clan = await cocClient.getClan(tag);
            clanDetails.push(`- ${clan.name} (Level ${clan.level}) - ${tag}`);
          } catch (error) {
            console.error(
              `Error fetching clan details for ${tag}:`,
              error.message
            );
            clanDetails.push(`- Unknown Clan - ${tag}`);
          }
        }
        return clanDetails.join("\n");
      };

      // Function to fetch player details
      const fetchPlayerDetails = async (playerTags) => {
        const playerDetails = [];
        for (const tag of playerTags) {
          try {
            const player = await cocClient.getPlayer(tag);
            playerDetails.push(
              `-  ${player.name} (Level ${player.expLevel}) - ${tag}`
            );
          } catch (error) {
            console.error(
              `Error fetching player details for ${tag}:`,
              error.message
            );
            playerDetails.push(` Unknown Player - ${tag}`);
          }
        }
        return playerDetails.join("\n");
      };

      // Fetch detailed information for linked clans and players
      const linkedClans = await fetchClanDetails(userProfile.clanTags || []);
      const linkedPlayers = await fetchPlayerDetails(
        userProfile.playerTags || []
      );

      // Define the PROFILE_INFO function
      const PROFILE_INFO = (profile) => {
        const noClansLinked = linkedClans === "";
        const noPlayersLinked = linkedPlayers === "";
        const instructionsClan = noClansLinked
          ? "\nTo link your clan, use *!linkclan* *#ClanTag*\n"
          : "";
        const instructionsPlayer = noPlayersLinked
          ? "\nTo link your player, use *!linkplayer* *#PlayerTag*\n"
          : "";

        return `
  👤 **User ID**: ${profile.userId || "N/A"}
  ${
    linkedClans
      ? `🏰 **Linked Clans**:\n${linkedClans}`
      : `🏰 **Linked Clans**: No clans linked${instructionsClan}`
  }
  ${
    linkedPlayers
      ? `👥 **Linked Players**:\n${linkedPlayers}`
      : `👥 **Linked Players**: No players linked${instructionsPlayer}`
  }
        `;
      };

      // Use PROFILE_INFO to format the profile information
      const profileInfo = PROFILE_INFO(userProfile);

      // Reply with the user's profile information
      await message.reply(profileInfo);
    } catch (error) {
      console.error("Error fetching user profile:", error.message);
      await message.reply(`Error fetching profile: ${error.message} ❌`);
    }
  },

  // Fetches and replies with detailed player information
  player: async (message, args) => {
    const chatID = message.from;
    let playerTag = args[0];
    const mention = args[1];
    let userId = message.author || message.from;

    if (mention) {
      userId = getUserIdFromMention(mention);
    }

    try {
      if (!playerTag) {
        const userProfile = await getUserProfile(chatID, userId);
        if (userProfile.playerTags && userProfile.playerTags.length > 0) {
          playerTag = userProfile.playerTags[0];
        } else {
          await message.reply(
            "Please provide a player tag, e.g., `!player #ABC123`."
          );
          return;
        }
      }

      const player = await cocClient.getPlayer(playerTag);
      await message.reply(messages.en.PLAYER_INFO(player));
    } catch (error) {
      console.error("Error fetching user profile:", error.message);
      await message.reply(`Error fetching profile: ${error.message} ❌`);
    }
  },

  // Fetches and replies with information about a Clash of Clans clan
  clan: async (message, args) => {
    const chatID = message.from;
    let clanTag = args[0];
    const mention = args[1];
    let userId = message.author || message.from;

    if (mention) {
      userId = getUserIdFromMention(mention);
    }

    try {
      if (!clanTag) {
        const userProfile = await getUserProfile(chatID, userId);
        if (userProfile.clanTags && userProfile.clanTags.length > 0) {
          clanTag = userProfile.clanTags[0];
        } else {
          await message.reply(
            "Please provide a clan tag, e.g., `!clan #ABC123`."
          );
          return;
        }
      }

      const clan = await cocClient.getClan(clanTag);
      await message.reply(messages.en.CLAN_INFO(clan));
    } catch (error) {
      console.error("Error fetching clan info:", error.code, error.message);
      await message.reply(
        `Error fetching clan information: ${error.message} ❌`
      );
    }
  },

  // Fetches and replies with the clan capital information
  capital: async (message, args) => {
    const chatID = message.from;
    const mention = args[0];
    let userId = message.author || message.from;

    try {
      const userProfile = await getUserProfile(chatID, userId);
      const clanTags = args.length ? args : userProfile.clanTags || [];

      if (clanTags.length === 0) {
        await message.reply(
          "Your profile is not linked to any clan tag. Please provide a clan tag, e.g., `!capital #ABC123`."
        );
        return;
      }

      for (const clanTag of clanTags) {
        const clan = await cocClient.getClan(clanTag); // Fetch clan info using the tag
        const capital = clan.capital;

        if (!capital) {
          await message.reply(
            `No capital information available for clan ${clan.name} (${clan.tag}). ❌`
          );
          continue;
        }

        // Prepare the response message
        let responseMessage = `🏰 **Clan**: ${clan.name} (${clan.tag})\n\n`;
        responseMessage += `🏰 **Capital Hall Level**: ${capital.capitalHallLevel}\n`;

        if (capital.districts && capital.districts.length > 0) {
          responseMessage += "🏰 **Districts**:\n";
          capital.districts.forEach((district) => {
            responseMessage += `  - ${district.name} (Level ${district.districtHallLevel})\n`;
          });
        } else {
          responseMessage += "🏰 **Districts**: No districts available.\n";
        }

        await message.reply(responseMessage);
      }
    } catch (error) {
      console.error(
        "Error fetching clan capital info:",
        error.code,
        error.message
      );
      await message.reply(
        `Error fetching clan capital information: ${error.message} ❌`
      );
    }
  },

  // Enhanced ping command
  ping: async (message) => {
    const chatID = message.from;
    const userId = message.author || message.from;

    try {
      // Send initial message
      const sentMessage = await message.reply("🏓 Pong! Checking latency...");

      // Measure API latency
      const startApiTime = performance.now();
      await cocClient.getClan("#2PP"); // Example clan tag to ping the API
      const endApiTime = performance.now();
      const apiLatency = endApiTime - startApiTime;

      // Measure bot latency
      const startBotTime = performance.now();
      await sentMessage.edit("🏓 Pong! Checking latency...");
      const endBotTime = performance.now();
      const botLatency = endBotTime - startBotTime;

      // Prepare response message
      const responseMessage = `API Latency: ${apiLatency.toFixed(
        2
      )}ms\nBot Latency: ${botLatency.toFixed(2)}ms`;

      // Edit the initial message with latency information
      await sentMessage.edit(responseMessage);
    } catch (error) {
      console.error("Error in ping command:", error.message);
      await message.reply(`Error occurred: ${error.message} ❌`);
    }
  },

  // Updated !coc help command
  coc: async (message) => {
    const helpMessage = messages.en.HELP;
    await message.reply(helpMessage);
  },

  // Fetches and replies with the current war attack details
  attack: async (message, args) => {
    const chatID = message.from;
    let userId = message.author || message.from;
    let clanTag = args[0] && args[0].startsWith("#") ? args[0] : null;

    // Function to extract user ID from mention
    const getUserIdFromMention = (mention) => {
      const mentionedUsers = message.getMentions();
      return mentionedUsers.length > 0 ? mentionedUsers[0] : null;
    };

    if (!clanTag && args[0]) {
      userId = getUserIdFromMention(args[0]);
    }

    try {
      const userProfile = await getUserProfile(chatID, userId);
      const clanTags = clanTag ? [clanTag] : userProfile.clanTags || [];

      if (clanTags.length === 0) {
        await message.reply(
          "Invalid or no clan tag provided, and no linked clans found in profile."
        );
        return;
      }

      for (const tag of clanTags) {
        try {
          const clan = await cocClient.getClan(tag); // Fetch clan info using the tag
          const war = await cocClient.getCurrentWar(tag);
          if (!war || !war.clan || !war.opponent || war.state === "notInWar") {
            await message.reply(
              `No current war information available for clan ${clan.name} (${clan.tag}). ❌`
            );
            continue;
          }

          // Fetch attack details, ensure attacks is an array
          const attacks = war.clan.attacks || [];

          if (attacks.length === 0) {
            await message.reply(`Clan ${clan.name} is in preparation day. ❌`);
            continue;
          }

          // Calculate total team size and completed attacks
          const teamSize = war.teamSize;
          const completedAttacks = attacks.length;
          const totalAttacks = teamSize * war.attacksPerMember;

          // Determine best defense and best attack
          const bestDefense = war.clan.members.reduce((best, member) => {
            const bestDefense = member.bestOpponentAttack;
            return bestDefense &&
              (!best || bestDefense.destruction > best.destruction)
              ? bestDefense
              : best;
          }, null);

          const bestAttack = attacks.reduce((best, attack) => {
            return !best ||
              attack.stars > best.stars ||
              (attack.stars === best.stars &&
                attack.destruction > best.destruction)
              ? attack
              : best;
          }, null);

          // Reply with all attack info in one message
          const attackDetails = messages.en.ATTACK_INFO(attacks);
          const bestDefenseInfo = messages.en.BEST_DEFENSE(bestDefense);
          const bestAttackInfo = messages.en.BEST_ATTACK(bestAttack);
          const teamInfo = messages.en.TEAM_INFO(
            teamSize,
            completedAttacks,
            totalAttacks
          );
          await message.reply(
            `🏰 **Clan**: ${clan.name} (${clan.tag})\n\n${attackDetails}\n\n${bestDefenseInfo}\n\n${bestAttackInfo}\n\n${teamInfo}`
          );
        } catch (error) {
          console.error(
            `Error fetching war information for clan ${tag}:`,
            error.message
          );
          await message.reply(
            `Error fetching war information for clan ${tag}: ${error.message} ❌`
          );
        }
      }
    } catch (error) {
      console.error(messages.en.ERROR_FETCH_ATTACK, error.code, error.message);
      await message.reply(`Error fetching attack details: ${error.message} ❌`);
    }
  },

  members: async (message, args) => {
    const chatID = message.from;
    let userId = message.author || message.from;
    let clanTag = args.find((arg) => arg.startsWith("#")) || null;
    const isTableFormat = args[0] === "table" || args.includes("table");

    // Function to extract user ID from mention
    const getUserIdFromMention = (mention) => {
      const mentionedUsers = message.getMentions();
      return mentionedUsers.length > 0 ? mentionedUsers[0] : null;
    };

    if (!clanTag && args[0] && !isTableFormat) {
      userId = getUserIdFromMention(args[0]);
    }

    try {
      const userProfile = await getUserProfile(chatID, userId);
      const clanTags = clanTag ? [clanTag] : userProfile.clanTags || [];

      if (clanTags.length === 0) {
        await message.reply(
          "Your profile is not linked to any clan tag. Please provide a clan tag, e.g., `!members #ABC123`."
        );
        return;
      }

      for (const tag of clanTags) {
        try {
          const clan = await cocClient.getClan(tag); // Fetch clan info using the tag
          const members = await cocClient.getClanMembers(tag); // Fetch clan members using the tag
          if (members.length === 0) {
            await message.reply(
              `No members found in the clan ${clan.name} (${clan.tag}).`
            );
            continue;
          }

          if (isTableFormat) {
            const header = [
              "#️⃣",
              "🏅Name",
              "⭐Role",
              "🎖Level",
              "🏰TH",
              "🏆Trophies",
              "📤Donations",
              "Received",
            ];
            const columnWidths = [5, 30, 12, 5, 6, 12, 10, 10];
            const xOffsets = columnWidths.map(
              (width, index) =>
                columnWidths.slice(0, index).reduce((a, b) => a + b, 0) * 16
            );

            let rows = members.map((member, index) => [
              String(index + 1),
              member.name,
              member.role,
              String(member.expLevel),
              String(member.townHallLevel),
              String(member.trophies),
              String(member.donations),
              String(member.received),
            ]);

            const lineHeight = 48; // Increased line height for larger text
            const canvasWidth = 2000;
            const canvasHeight = 2896;
            const padding = 150; // Increased padding for better spacing
            const baseHeight = 100;
            const totalLines = rows.length + 2;
            const contentHeight = totalLines * lineHeight + baseHeight;

            const canvas = createCanvas(canvasWidth, canvasHeight);
            const ctx = canvas.getContext("2d");

            // Load the background image
            const backgroundImage = await loadImage(
              path.join(__dirname, "clan.jpg")
            );
            ctx.drawImage(backgroundImage, 0, 0, canvasWidth, canvasHeight);

            // Calculate starting positions for centering the content
            const startX =
              (canvasWidth -
                (xOffsets[xOffsets.length - 1] +
                  columnWidths[columnWidths.length - 1] * 16)) /
              2;
            const startY = (canvasHeight - contentHeight) / 2 + padding;

            // Set text properties
            ctx.font = "30px Arial"; // Increased font size
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";

            // Draw table grid
            ctx.strokeStyle = "#000000";
            ctx.lineWidth = 2;

            // Draw vertical grid lines
            xOffsets.forEach((xOffset, colIndex) => {
              const x = startX + xOffset;
              ctx.beginPath();
              ctx.moveTo(x, startY);
              ctx.lineTo(x, startY + totalLines * lineHeight);
              ctx.stroke();
            });

            // Draw horizontal grid lines
            for (let i = 0; i <= rows.length + 1; i++) {
              const y = startY + i * lineHeight;
              ctx.beginPath();
              ctx.moveTo(startX, y);
              ctx.lineTo(
                startX +
                  xOffsets[xOffsets.length - 1] +
                  columnWidths[columnWidths.length - 1] * 16,
                y
              );
              ctx.stroke();
            }

            // Draw table header with a distinct background color
            ctx.fillStyle = "#f0f0f0";
            ctx.fillRect(startX, startY, canvasWidth - 2 * padding, lineHeight);

            ctx.fillStyle = "#000000";
            header.forEach((text, colIndex) => {
              ctx.fillText(
                text,
                startX + xOffsets[colIndex] + 10,
                startY + lineHeight / 2
              );
            });

            // Draw table rows
            rows.forEach((row, rowIndex) => {
              row.forEach((text, colIndex) => {
                ctx.fillText(
                  text,
                  startX + xOffsets[colIndex] + 10,
                  startY + (rowIndex + 1) * lineHeight + lineHeight / 2
                );
              });
            });

            const buffer = canvas.toBuffer("image/png");
            const media = new MessageMedia(
              "image/png",
              buffer.toString("base64"),
              "members.png"
            );
            await message.reply(media);
          } else {
            await message.reply(
              `🏰 **Clan**: ${clan.name} (${
                clan.tag
              })\n\n${messages.en.MEMBERS_INFO_LIST(members)}`
            );
          }
        } catch (error) {
          console.error("Error fetching clan members:", error.message);
          await message.reply(
            `Error fetching clan members for clan ${tag}: ${error.message} ❌`
          );
        }
      }
    } catch (error) {
      console.error("Error fetching clan members:", error.code, error.message);
      await message.reply(`Error fetching clan members: ${error.message} ❌`);
    }
  },

  // Fetches and replies with the clan war log
  warlog: async (message, args) => {
    const chatID = message.from;
    let userId = message.author || message.from;
    let clanTag = args[0] && args[0].startsWith("#") ? args[0] : null;

    // Function to extract user ID from mention
    const getUserIdFromMention = (mention) => {
      const mentionedUsers = message.getMentions();
      return mentionedUsers.length > 0 ? mentionedUsers[0] : null;
    };

    if (!clanTag && args[0]) {
      userId = getUserIdFromMention(args[0]);
    }

    try {
      const userProfile = await getUserProfile(chatID, userId);
      const clanTags = clanTag ? [clanTag] : userProfile.clanTags || [];

      if (clanTags.length === 0) {
        await message.reply(
          "Invalid or no clan tag provided, and no linked clans found in profile."
        );
        return;
      }

      for (const tag of clanTags) {
        try {
          const clan = await cocClient.getClan(tag); // Fetch clan info using the tag
          const warLog = await cocClient.getClanWarLog(tag);
          if (warLog.length === 0) {
            await message.reply(
              `No war log available for the clan ${clan.name} (${clan.tag}). ❌`
            );
            continue;
          }

          const wars = warLog.slice(0, 10).map((war, index) => ({
            opponentName: war.opponent.name,
            result: war.result,
            clanStars: war.clan.stars,
            opponentStars: war.opponent.stars,
            expEarned: war.clan.expEarned,
            startTime: new Date(war.startTime).toLocaleString(),
            endTime: new Date(war.endTime).toLocaleString(),
          }));

          const canvasWidth = 800;
          const lineHeight = 30;
          const headerHeight = 60;
          const padding = 20;
          const rowHeight = lineHeight + 10;
          const canvasHeight =
            headerHeight + rowHeight * wars.length + padding * 2;

          const canvas = createCanvas(canvasWidth, canvasHeight);
          const ctx = canvas.getContext("2d");

          // Load the background image
          const backgroundImage = await loadImage(
            path.join(__dirname, "clan.jpg")
          );
          ctx.drawImage(backgroundImage, 0, 0, canvasWidth, canvasHeight);

          const columnTitles = [
            "Opponent",
            "Result",
            "Stars",
            "Exp Earned",
            "Start Time",
            "End Time",
          ];
          const columnWidths = [150, 80, 80, 100, 200, 200];
          let xOffset = padding;

          ctx.fillStyle = "#000000";
          ctx.font = "bold 16px Arial";

          // Draw the table header
          columnTitles.forEach((title, index) => {
            ctx.fillText(title, xOffset, headerHeight);
            xOffset += columnWidths[index];
          });

          // Draw the rows
          wars.forEach((war, rowIndex) => {
            const yOffset = headerHeight + padding + rowHeight * (rowIndex + 1);

            // Alternate row colors for better readability
            ctx.fillStyle =
              rowIndex % 2 === 0
                ? "rgba(255, 255, 255, 0.8)"
                : "rgba(245, 245, 245, 0.8)";
            ctx.fillRect(0, yOffset - lineHeight, canvasWidth, rowHeight);

            // Draw the war details
            xOffset = padding;
            const values = [
              war.opponentName,
              war.result,
              `${war.clanStars} - ${war.opponentStars}`,
              war.expEarned,
              war.startTime,
              war.endTime,
            ];
            ctx.fillStyle = "#000000";
            ctx.font = "16px Arial";

            values.forEach((value, colIndex) => {
              ctx.fillText(value, xOffset, yOffset);
              xOffset += columnWidths[colIndex];
            });
          });

          const buffer = canvas.toBuffer("image/png");
          const media = new MessageMedia(
            "image/png",
            buffer.toString("base64"),
            "warlog.png"
          );
          await message.reply(media);
        } catch (error) {
          console.error(
            "Error fetching clan war log:",
            error.code,
            error.message
          );
          await message.reply(`Error: ${error.message} ❌`);
        }
      }
    } catch (error) {
      console.error("Error fetching user profile:", error.message);
      await message.reply(`Error fetching profile: ${error.message} ❌`);
    }
  },

  // Fetches and replies with the labels of a clan
  labels: async (message, args) => {
    const chatID = message.from;
    let clanTag = args[0];
    const mention = args[1];
    let userId = message.author || message.from;

    if (mention) {
      userId = getUserIdFromMention(mention);
    }

    try {
      if (!clanTag) {
        const userProfile = await getUserProfile(chatID, userId);
        if (userProfile.clanTags && userProfile.clanTags.length > 0) {
          clanTag = userProfile.clanTags[0];
        } else {
          await message.reply(
            "Please provide a clan tag, e.g., `!labels #ABC123`."
          );
          return;
        }
      }

      const clan = await cocClient.getClan(clanTag);

      if (!clan.labels || clan.labels.length === 0) {
        await message.reply(
          `No labels available for the clan ${clan.name} (${clan.tag}). ❌`
        );
        return;
      }

      // Prepare the response message
      let responseMessage = `🏰 **Clan Labels for ${clan.name} (${clan.tag})**:\n\n`;
      responseMessage += messages.en.LABELS_INFO(clan.labels);

      await message.reply(responseMessage);
    } catch (error) {
      console.error("Error fetching clan labels:", error.code, error.message);
      await message.reply(`Error fetching clan labels: ${error.message} ❌`);
    }
  },

  // Fetches and replies with the composition of a clan
  compo: async (message, args) => {
    const chatID = message.from;
    let clanTag = args[0];
    const mention = args[1];
    let userId = message.author || message.from;

    if (mention) {
      userId = getUserIdFromMention(mention);
    }

    try {
      if (!clanTag) {
        const userProfile = await getUserProfile(chatID, userId);
        if (userProfile.clanTags && userProfile.clanTags.length > 0) {
          clanTag = userProfile.clanTags[0];
        } else {
          await message.reply(
            "Please provide a clan tag, e.g., `!compo #ABC123`."
          );
          return;
        }
      }

      const clan = await cocClient.getClan(clanTag);
      const members = await cocClient.getClanMembers(clanTag);

      // Count the number of players at each Town Hall level
      const thCounts = members.reduce((counts, member) => {
        const thLevel = member.townHallLevel;
        counts[thLevel] = (counts[thLevel] || 0) + 1;
        return counts;
      }, {});

      // Prepare the response message
      let responseMessage = `🏰 **Clan Composition for ${clan.name} (${clan.tag})**:\n\n`;
      Object.keys(thCounts).forEach((thLevel) => {
        responseMessage += `🏠 TH ${thLevel}: ${thCounts[thLevel]}\n`;
      });

      await message.reply(responseMessage);
    } catch (error) {
      console.error(
        "Error fetching clan composition:",
        error.code,
        error.message
      );
      await message.reply(
        `Error fetching clan composition: ${error.message} ❌`
      );
    }
  },

  /**
   * Fetches and replies with the current war information.
   * Usage: !war <clanTag>
   * If no clanTag is provided, fetches the war info for the linked profile's clan.
   * @param {object} message - The incoming message object from WhatsApp.
   * @param {Array} args - Additional arguments sent with the command.
   */
  war: async (message, args) => {
    const chatID = message.from;
    const mention = args[0];
    let userId = message.author || message.from;
    let clanTag = args[0] && args[0].startsWith("#") ? args[0] : null;

    if (mention && !clanTag) {
      userId = getUserIdFromMention(mention);
    }

    try {
      const userProfile = await getUserProfile(chatID, userId);
      const clanTags = clanTag ? [clanTag] : userProfile.clanTags || [];

      if (clanTags.length === 0) {
        await message.reply(messages.en.INVALID_TAG);
        return;
      }

      for (const tag of clanTags) {
        try {
          const clan = await cocClient.getClan(tag); // Fetch clan info using the tag
          const war = await cocClient.getCurrentWar(tag);
          if (!war || !war.clan || !war.opponent || war.state === "notInWar") {
            await message.reply(
              `No current war information available for clan ${clan.name} (${clan.tag}). ❌`
            );
            continue;
          }

          const startTime = war.startTime
            ? new Date(war.startTime).toLocaleString()
            : "N/A";
          const endTime = war.endTime
            ? new Date(war.endTime).toLocaleString()
            : "N/A";
          const warType = war.isFriendly
            ? "Friendly"
            : war.isCWL
            ? "CWL"
            : "Normal";

          // Collect attack information
          let attackDetails = "";
          war.clan.attacks.forEach((attack) => {
            const attacker = war.clan.members.find(
              (member) => member.tag === attack.attackerTag
            );
            const defender = war.opponent.members.find(
              (member) => member.tag === attack.defenderTag
            );
            if (attacker && defender) {
              attackDetails += `\n🏹 **${attacker.name} (#${attacker.mapPosition})** attacked **${defender.name} (#${defender.mapPosition})**`;
            }
          });

          const warInfo = `
  ⚔️ **War State**: ${war.state || "N/A"}
  🛡️ **Clan**: ${war.clan.name} (${war.clan.tag}) vs ${war.opponent.name} (${
            war.opponent.tag
          })
  ⭐ **Stars**: ${war.clan.stars || 0} - ${war.opponent.stars || 0}
  💥 **Destruction**: ${war.clan.destructionPercentage || 0}% - ${
            war.opponent.destructionPercentage || 0
          }%
  👥 **Team Size**: ${war.teamSize || "N/A"}
  ⚔️ **Attacks per Member**: ${war.attacksPerMember || "N/A"}
  🏆 **War Type**: ${warType}
  🕒 **Preparation Start Time**: ${
    war.preparationStartTime
      ? new Date(war.preparationStartTime).toLocaleString()
      : "N/A"
  }
  🕒 **Start Time**: ${
    war.startTime ? new Date(war.startTime).toLocaleString() : "N/A"
  }
  🕒 **End Time**: ${
    war.endTime ? new Date(war.endTime).toLocaleString() : "N/A"
  }
  ${attackDetails}
          `;
          await message.reply(warInfo);
        } catch (error) {
          console.error("Error fetching war info:", error.code, error.message);
          await message.reply(
            `Error fetching war information for clan ${tag}: ${error.message} ❌`
          );
        }
      }
    } catch (error) {
      console.error("Error fetching user profile:", error.message);
      await message.reply(`Error fetching profile: ${error.message} ❌`);
    }
  },

  /**
   * Fetches and replies with the members who haven't completed their attacks.
   * Usage: !leftattack <clanTag>
   * @param {object} message - The incoming message object from WhatsApp.
   * @param {Array} args - Additional arguments sent with the command.
   */
  leftattack: async (message, args) => {
    const chatID = message.from;
    const mention = args[0];
    let userId = message.author || message.from;
    let clanTag = args[0] && args[0].startsWith("#") ? args[0] : null;

    if (mention && !clanTag) {
      userId = getUserIdFromMention(mention);
    }

    try {
      const userProfile = await getUserProfile(chatID, userId);
      const clanTags = clanTag ? [clanTag] : userProfile.clanTags || [];

      if (clanTags.length === 0) {
        await message.reply(messages.en.INVALID_TAG);
        return;
      }

      for (const tag of clanTags) {
        try {
          const clan = await cocClient.getClan(tag); // Fetch clan info using the tag
          const war = await cocClient.getCurrentWar(tag);
          if (!war || !war.clan || !war.opponent || war.state === "notInWar") {
            await message.reply(
              `No current war information available for clan ${clan.name} (${clan.tag}). ❌`
            );
            continue;
          }

          const membersWithBothAttacksLeft = war.clan.members.filter(
            (member) => member.attacks.length === 0
          );
          const membersWithOneAttackLeft = war.clan.members.filter(
            (member) => member.attacks.length === 1
          );

          let responseMessage = `🛡️ **Members who haven't completed their attacks in clan ${clan.name} (${clan.tag})**:\n`;

          if (membersWithBothAttacksLeft.length > 0) {
            responseMessage += "\n⚔️⚔️ *Both Attacks Left*:\n";
            for (const member of membersWithBothAttacksLeft) {
              responseMessage += `\n🗺#${member.mapPosition}). ${member.name}`;
            }
          } else {
            responseMessage +=
              "\nAll members have used at least one attack. ✅\n";
          }

          if (membersWithOneAttackLeft.length > 0) {
            responseMessage += "\n⚔️ *One Attack Left*:\n";
            for (const member of membersWithOneAttackLeft) {
              responseMessage += `\n🗺#${member.mapPosition}). ${member.name}`;
            }
          }

          const totalAttacksLeft =
            membersWithBothAttacksLeft.length * 2 +
            membersWithOneAttackLeft.length;
          responseMessage += `\n\n*Total Attacks Left*: ${totalAttacksLeft}`;

          await message.reply(responseMessage);
        } catch (error) {
          console.error("Error fetching war info:", error.code, error.message);
          await message.reply(
            `Error fetching war information for clan ${tag}: ${error.message} ❌`
          );
        }
      }
    } catch (error) {
      console.error("Error fetching user profile:", error.message);
      await message.reply(`Error fetching profile: ${error.message} ❌`);
    }
  },

  /**
   * Provides bot information.
   * @param {object} message - The incoming message object from WhatsApp.
   */
  botinfo: async (message) => {
    await message.reply(messages.en.BOT_INFO);
  },
};
