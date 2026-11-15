require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');

const {
  Client,
  GatewayIntentBits,
  Collection,
  ContainerBuilder,
  EmbedBuilder,
  TextDisplayBuilder,
  MessageFlags,
} = require('discord.js');

const { handleOrderInteraction } = require('./systems/orders');
const { handleGiveawayInteraction, resumeGiveaways } = require('./systems/giveaway');
const { handlePortfolioMessage } = require('./systems/portfolios');

if (!process.env.TOKEN) {
  console.error('[Startup] Missing TOKEN in .env file.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');

if (!fs.existsSync(commandsPath)) {
  console.error('[Commands] Commands folder does not exist.');
  process.exit(1);
}

const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  try {
    const command = require(path.join(commandsPath, file));

    if (command.data && typeof command.execute === 'function') {
      client.commands.set(command.data.name, command);
      console.log(`[Commands] Loaded: ${command.data.name}`);
    } else {
      console.warn(`[Commands] ${file} is missing data or execute().`);
    }
  } catch (error) {
    console.error(`[Commands] Failed to load ${file}:`, error);
  }
}

function buildPayload(result, ephemeral = false) {
  const items = Array.isArray(result) ? result : [result];

  const texts = items.filter((item) => typeof item === 'string');
  const embeds = items.filter((item) => item instanceof EmbedBuilder);
  const containers = items.filter((item) => item instanceof ContainerBuilder);

  const flags = ephemeral ? MessageFlags.Ephemeral : 0;

  if (containers.length) {
    const components = [
      ...texts.map((content) => new TextDisplayBuilder().setContent(content)),
      ...containers,
    ];

    return { components, flags: flags | MessageFlags.IsComponentsV2 };
  }

  const payload = {};

  if (texts.length) payload.content = texts.join('\n');
  if (embeds.length) payload.embeds = embeds;
  if (flags) payload.flags = flags;

  return payload;
}

function resolveResult(result) {
  if (result && result.constructor === Object && 'message' in result) {
    return buildPayload(result.message, result.ephemeral);
  }

  return buildPayload(result);
}

async function handleInteractionError(interaction, error) {
  console.error('[Interaction Error]', error);

  const response = {
    content: 'Something went wrong. Please try again later.',
    flags: MessageFlags.Ephemeral,
  };

  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(response);
    } else {
      await interaction.reply(response);
    }
  } catch (replyError) {
    console.error('[Interaction Error] Could not send error response:', replyError);
  }
}

client.once('clientReady', async () => {
  console.log(`[Bot] Logged in as ${client.user.tag}`);

  try {
    const body = client.commands.map((command) => command.data.toJSON());
    const guildId = process.env.GUILD_ID;

    if (!guildId) {
      console.warn('[Commands] GUILD_ID is missing. Commands were not registered.');
    } else {
      const guild = await client.guilds.fetch(guildId);
      await guild.commands.set(body);
      console.log(`[Commands] Registered ${body.length} guild commands.`);
    }
  } catch (error) {
    console.error('[Commands] Command registration failed:', error);
  }

  try {
    resumeGiveaways(client);
  } catch (error) {
    console.error('[Giveaways] Failed to restore giveaways:', error);
  }

  console.log('[Bot] Startup completed.');
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton() || interaction.isModalSubmit()) {
    try {
      if (interaction.isButton() && interaction.customId.startsWith('gw_')) {
        return await handleGiveawayInteraction(interaction);
      }

      if (interaction.customId.startsWith('order_')) {
        return await handleOrderInteraction(interaction);
      }
    } catch (error) {
      await handleInteractionError(interaction, error);
    }

    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    return interaction.reply({
      content: 'This command could not be found.',
      flags: MessageFlags.Ephemeral,
    });
  }

  try {
    const result = await command.execute(interaction);

    if (!result || interaction.replied || interaction.deferred) return;

    await interaction.reply(resolveResult(result));
  } catch (error) {
    await handleInteractionError(interaction, error);
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  try {
    await handlePortfolioMessage(message);
  } catch (error) {
    console.error('[Portfolio] Message handler error:', error);
  }
});

client.login(process.env.TOKEN).catch((error) => {
  console.error('[Startup] Discord login failed:', error);
  process.exit(1);
});