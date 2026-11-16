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

// System handlers
const { handleOrderInteraction } = require('./systems/orders');
const {
  handleGiveawayInteraction,
  resumeGiveaways,
} = require('./systems/giveaway');

const {
  handlePollInteraction,
  resumePolls,
} = require('./systems/polls');

const { handleRoleListInteraction } = require('./systems/rolelist');
const { handleDashboardInteraction } = require('./systems/dashboard');
const { handlePortfolioMessage } = require('./systems/portfolios');
const {
  handleCaseInteraction,
  handlePrefixCommand,
  handleChannelDelete,
} = require('./systems/cases');

const PREFIX = '^';

// Check environment variables
if (!process.env.TOKEN) {
  console.error('[Startup] Missing TOKEN in .env file.');
  process.exit(1);
}

// Create Discord client (ONLY ONCE)
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();
client.prefixCommands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'commands');

if (!fs.existsSync(commandsPath)) {
  console.error('[Commands] Commands folder does not exist.');
  process.exit(1);
}

const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  try {
    const command = require(path.join(commandsPath, file));

    if (
      command.data &&
      typeof command.execute === 'function'
    ) {
      client.commands.set(command.data.name, command);
      console.log(`[Commands] Loaded: ${command.data.name}`);

      // Commands that also export prefix() can be run with ^name
      if (typeof command.prefix === 'function') {
        client.prefixCommands.set(command.data.name, command);
      }
    } else {
      console.warn(
        `[Commands] ${file} is missing data or execute().`
      );
    }
  } catch (error) {
    console.error(`[Commands] Failed to load ${file}:`, error);
  }
}

// Build Discord response payload
function buildPayload(result, ephemeral = false) {
  const items = Array.isArray(result) ? result : [result];

  const texts = items.filter(
    (item) => typeof item === 'string'
  );

  const embeds = items.filter(
    (item) => item instanceof EmbedBuilder
  );

  const containers = items.filter(
    (item) => item instanceof ContainerBuilder
  );

  const flags = ephemeral ? MessageFlags.Ephemeral : 0;

  // Components V2 response
  if (containers.length) {
    const components = [
      ...texts.map(
        (content) =>
          new TextDisplayBuilder().setContent(content)
      ),
      ...containers,
    ];

    return {
      components,
      flags: flags | MessageFlags.IsComponentsV2,
    };
  }

  // Normal response
  const payload = {};

  if (texts.length) {
    payload.content = texts.join('\n');
  }

  if (embeds.length) {
    payload.embeds = embeds;
  }

  if (flags) {
    payload.flags = flags;
  }

  return payload;
}

// Resolve command result
function resolveResult(result) {
  if (
    result &&
    result.constructor === Object &&
    'message' in result
  ) {
    return buildPayload(result.message, result.ephemeral);
  }

  return buildPayload(result);
}

// Handle interaction errors
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
    console.error(
      '[Interaction Error] Could not send error response:',
      replyError
    );
  }
}

// Bot ready event
client.once('clientReady', async () => {
  console.log(`[Bot] Logged in as ${client.user.tag}`);

  // Register slash commands
  try {
    const body = client.commands.map(
      (command) => command.data.toJSON()
    );

    const guildId = process.env.GUILD_ID;

    if (!guildId) {
      console.warn(
        '[Commands] GUILD_ID is missing. Commands were not registered.'
      );
    } else {
      const guild = await client.guilds.fetch(guildId);

      await guild.commands.set(body);

      console.log(
        `[Commands] Registered ${body.length} guild commands.`
      );
    }
  } catch (error) {
    console.error(
      '[Commands] Command registration failed:',
      error
    );
  }

  // Restore giveaways
  try {
    await resumeGiveaways(client);
    console.log('[Giveaways] Restoration completed.');
  } catch (error) {
    console.error(
      '[Giveaways] Failed to restore giveaways:',
      error
    );
  }

  // Restore polls
  try {
    await resumePolls(client);
    console.log('[Polls] Restoration completed.');
  } catch (error) {
    console.error(
      '[Polls] Failed to restore polls:',
      error
    );
  }

  console.log('[Bot] Startup completed.');
});

// Interaction handler
client.on('interactionCreate', async (interaction) => {
  // Buttons, dropdown menus and modals
  if (
    interaction.isButton() ||
    interaction.isStringSelectMenu() ||
    interaction.isModalSubmit()
  ) {
    try {
      // Tickets and orders: claim, unclaim, close, transcripts, lists
      if (interaction.customId.startsWith('case_')) {
        return await handleCaseInteraction(interaction);
      }

      if (interaction.customId.startsWith('dash_')) {
        return await handleDashboardInteraction(interaction);
      }

      if (
        interaction.isButton() &&
        interaction.customId.startsWith('gw_')
      ) {
        return await handleGiveawayInteraction(interaction);
      }

      if (
        interaction.isButton() &&
        interaction.customId.startsWith('poll_')
      ) {
        return await handlePollInteraction(interaction);
      }

      if (
        interaction.isButton() &&
        interaction.customId.startsWith('rolelist')
      ) {
        return await handleRoleListInteraction(interaction);
      }

      if (
        interaction.customId.startsWith('order_')
      ) {
        return await handleOrderInteraction(interaction);
      }
    } catch (error) {
      await handleInteractionError(interaction, error);
    }

    return;
  }

  // Slash commands
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(
    interaction.commandName
  );

  if (!command) {
    return interaction.reply({
      content: 'This command could not be found.',
      flags: MessageFlags.Ephemeral,
    });
  }

  try {
    const result = await command.execute(interaction);

    if (
      result === undefined ||
      result === null ||
      interaction.replied ||
      interaction.deferred
    ) {
      return;
    }

    await interaction.reply(resolveResult(result));
  } catch (error) {
    await handleInteractionError(interaction, error);
  }
});

// Portfolio message handler
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  try {
    await handlePortfolioMessage(message);
  } catch (error) {
    console.error(
      '[Portfolio] Message handler error:',
      error
    );
  }

  if (!message.content.startsWith(PREFIX)) return;

  // ^claim ^unclaim ^close ^rename (tickets and orders only)
  try {
    await handlePrefixCommand(message);
  } catch (error) {
    console.error('[Cases] Prefix command error:', error);
  }

  // ^ticket ^ticket-lookup ^ticket-list ^purchase-log
  const [name, ...args] = message.content
    .slice(PREFIX.length)
    .trim()
    .split(/\s+/);

  const prefixCommand = client.prefixCommands.get(
    (name || '').toLowerCase()
  );

  if (!prefixCommand) return;

  try {
    await prefixCommand.prefix(message, args);
  } catch (error) {
    console.error('[Prefix Command Error]', error);
    message.reply('Something went wrong. Please try again later.').catch(() => {});
  }
});

// A ticket or order channel deleted by hand still gets logged
client.on('channelDelete', async (channel) => {
  try {
    await handleChannelDelete(channel);
  } catch (error) {
    console.error('[Cases] Channel delete error:', error);
  }
});

// Discord client error handler
client.on('error', (error) => {
  console.error('[Discord Client Error]', error);
});

// Login
client.login(process.env.TOKEN).catch((error) => {
  console.error('[Startup] Discord login failed:', error);
  process.exit(1);
});