require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const {
  Client, GatewayIntentBits, Collection,
  ContainerBuilder, EmbedBuilder, TextDisplayBuilder, MessageFlags,
} = require('discord.js');
const { handleOrderInteraction } = require('./orders');

// 1. Create the client FIRST
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// 2. Load commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.warn(`${file} is missing "data" or "execute", skipping.`);
  }
}

// 3. Helpers
function buildPayload(result, ephemeral = false) {
  const items = Array.isArray(result) ? result : [result];

  const texts = items.filter(i => typeof i === 'string');
  const embeds = items.filter(i => i instanceof EmbedBuilder);
  const containers = items.filter(i => i instanceof ContainerBuilder);

  const flags = ephemeral ? MessageFlags.Ephemeral : 0;

  if (containers.length) {
    const components = [
      ...texts.map(t => new TextDisplayBuilder().setContent(t)),
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

// 4. Events
client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const body = client.commands.map(command => command.data.toJSON());

  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  await guild.commands.set(body);

  console.log(`Registered ${body.length} commands`);
});

client.on('interactionCreate', async (interaction) => {
  // Buttons + modals
  if (interaction.isButton() || interaction.isModalSubmit()) {
    try {
      if (interaction.customId.startsWith('order_')) {
        await handleOrderInteraction(interaction);
      }
    } catch (error) {
      console.error(error);
      const msg = { content: 'Something went wrong.', flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => {});
      else await interaction.reply(msg).catch(() => {});
    }
    return;
  }

  // Slash commands
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    const result = await command.execute(interaction);

    if (!result || interaction.replied || interaction.deferred) return;

    await interaction.reply(resolveResult(result));
  } catch (error) {
    console.error(error);
    const msg = { content: 'Something went wrong running that command.', flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(msg);
    } else {
      await interaction.reply(msg);
    }
  }
});

// 5. Login LAST
client.login(process.env.TOKEN);