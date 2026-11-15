
const fs = require('node:fs');
const path = require('node:path');

const {
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SectionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require('discord.js');

const FOOTER_URL =
  'https://cdn.phototourl.com/member/2026-11-15-92b4d11b-7a03-489d-9071-4fde46d0fafe.png';

const TEXT = {
  enterLabel: 'Enter Giveaway',
  endedLabel: 'Giveaway Ended',
  leaveLabel: 'Leave',

  active: (g) =>
    `# 🎉 Giveaway\n` +
    `**Prize:** ${g.prize}\n` +
    `**Hosted by:** <@${g.hostId}>\n` +
    `**Ends:** <t:${Math.floor(g.endsAt / 1000)}:R>\n` +
    `**Winners:** ${g.winners}\n` +
    `**Entries:** ${g.entries.length}\n\n` +
    `Click the button below to enter!`,

  ended: (g) =>
    `# 🎉 Giveaway Ended\n` +
    `**Prize:** ${g.prize}\n` +
    `**Hosted by:** <@${g.hostId}>\n` +
    `**Ended:** <t:${Math.floor(g.endsAt / 1000)}:R>\n` +
    `**Entries:** ${g.entries.length}\n\n` +
    (g.winnerIds.length
      ? `**Winner${g.winnerIds.length === 1 ? '' : 's'}:** ${g.winnerIds.map((id) => `<@${id}>`).join(', ')}`
      : '**Winners:** No valid entries'),

  announceWinners: (g) =>
    `🎉 Congratulations ${g.winnerIds.map((id) => `<@${id}>`).join(', ')}! You won **${g.prize}**!`,

  announceNoEntries: (g) =>
    `Nobody entered the giveaway for **${g.prize}**, so there are no winners.`,

  entered: 'You have entered the giveaway. Good luck!',
  confirmLeave: "You're already in this giveaway. Do you want to leave it?",
  left: 'You have left the giveaway.',
  alreadyEnded: 'This giveaway has already ended.',
};

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;

const FILE = path.join(__dirname, 'giveaways.json');

let data = {};

try {
  if (fs.existsSync(FILE)) {
    data = JSON.parse(fs.readFileSync(FILE, 'utf8'));

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      data = {};
    }
  }
} catch (error) {
  console.error('[Giveaways] Failed to load storage:', error);
  data = {};
}

function save() {
  try {
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('[Giveaways] Failed to save storage:', error);
  }
}

const text = (content) =>
  new TextDisplayBuilder().setContent(content);

const gallery = (url) =>
  new MediaGalleryBuilder().addItems(
    new MediaGalleryItemBuilder().setURL(url)
  );

const divider = () =>
  new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);

function parseDuration(input) {
  if (typeof input !== 'string') return null;

  const match = /^(\d+)\s*(s|m|h|d|w)$/i.exec(input.trim());

  if (!match) return null;

  const units = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };

  const amount = Number(match[1]);
  const ms = amount * units[match[2].toLowerCase()];

  if (!Number.isSafeInteger(ms)) return null;
  if (ms < 10_000 || ms > 30 * 86_400_000) return null;

  return ms;
}

function buildGiveaway(g) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      text(g.ended ? TEXT.ended(g) : TEXT.active(g))
    )
    .addSeparatorComponents(divider())
    .addMediaGalleryComponents(gallery(FOOTER_URL))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('gw_enter')
          .setLabel(g.ended ? TEXT.endedLabel : TEXT.enterLabel)
          .setEmoji('🎉')
          .setStyle(
            g.ended ? ButtonStyle.Secondary : ButtonStyle.Success
          )
          .setDisabled(g.ended)
      )
    );
}

async function fetchGiveawayMessage(client, g, messageId) {
  try {
    const channel = await client.channels.fetch(g.channelId);

    if (!channel || !channel.isTextBased() || !channel.messages) {
      return null;
    }

    return await channel.messages.fetch(messageId);
  } catch {
    return null;
  }
}

const refreshTimers = new Map();

function refresh(client, messageId) {
  if (refreshTimers.has(messageId)) return;

  const timer = setTimeout(async () => {
    refreshTimers.delete(messageId);

    const g = data[messageId];

    if (!g || g.ended) return;

    const message = await fetchGiveawayMessage(client, g, messageId);

    if (!message) return;

    await message.edit({
      components: [buildGiveaway(g)],
      flags: V2,
    }).catch(console.error);
  }, 2000);

  refreshTimers.set(messageId, timer);
}

const endTimers = new Map();

function schedule(client, messageId) {
  const g = data[messageId];

  if (!g || g.ended) return;

  const existing = endTimers.get(messageId);

  if (existing) clearTimeout(existing);

  const wait = Math.min(
    Math.max(g.endsAt - Date.now(), 0),
    2_000_000_000
  );

  const timer = setTimeout(() => {
    endTimers.delete(messageId);

    if (Date.now() >= g.endsAt) {
      endGiveaway(client, messageId).catch(console.error);
    } else {
      schedule(client, messageId);
    }
  }, wait);

  endTimers.set(messageId, timer);
}

async function endGiveaway(client, messageId) {
  const g = data[messageId];

  if (!g || g.ended) return;

  const pool = [...g.entries];

  g.winnerIds = [];

  while (pool.length && g.winnerIds.length < g.winners) {
    const index = Math.floor(Math.random() * pool.length);
    g.winnerIds.push(pool.splice(index, 1)[0]);
  }

  g.ended = true;
  save();

  const timer = endTimers.get(messageId);

  if (timer) clearTimeout(timer);

  endTimers.delete(messageId);

  const message = await fetchGiveawayMessage(client, g, messageId);

  if (!message) {
    console.error(`[Giveaways] Could not find giveaway message ${messageId}`);
    return;
  }

  await message.edit({
    components: [buildGiveaway(g)],
    flags: V2,
  }).catch(console.error);

  await message.reply({
    content: g.winnerIds.length
      ? TEXT.announceWinners(g)
      : TEXT.announceNoEntries(g),
    allowedMentions: {
      users: g.winnerIds,
    },
  }).catch(console.error);
}

async function createGiveaway(
  channel,
  { prize, hostId, winners, durationMs }
) {
  if (!channel || !channel.guild || !channel.isTextBased()) {
    throw new Error('Invalid giveaway channel.');
  }

  if (!prize || !hostId) {
    throw new Error('Prize and host ID are required.');
  }

  if (!Number.isInteger(winners) || winners < 1 || winners > 20) {
    throw new Error('Winners must be between 1 and 20.');
  }

  if (
    !Number.isSafeInteger(durationMs) ||
    durationMs < 10_000 ||
    durationMs > 30 * 86_400_000
  ) {
    throw new Error('Invalid giveaway duration.');
  }

  const g = {
    guildId: channel.guild.id,
    channelId: channel.id,
    prize,
    hostId,
    winners,
    endsAt: Date.now() + durationMs,
    entries: [],
    ended: false,
    winnerIds: [],
  };

  const message = await channel.send({
    components: [buildGiveaway(g)],
    flags: V2,
  });

  data[message.id] = g;
  save();

  schedule(channel.client, message.id);

  return message;
}

function resumeGiveaways(client) {
  for (const id of Object.keys(data)) {
    const g = data[id];

    if (!g || g.ended) continue;

    if (
      !g.channelId ||
      !Number.isFinite(g.endsAt) ||
      !Array.isArray(g.entries)
    ) {
      console.error(`[Giveaways] Invalid giveaway data: ${id}`);
      continue;
    }

    schedule(client, id);
  }

  console.log('[Giveaways] Active giveaway timers restored.');
}

async function handleGiveawayInteraction(interaction) {
  if (!interaction.isButton()) return;

  const [action, targetId] = interaction.customId.split('|');
  const userId = interaction.user.id;

  if (action === 'gw_enter') {
    const messageId = interaction.message.id;
    const g = data[messageId];

    if (!g || g.ended || Date.now() >= g.endsAt) {
      if (g && !g.ended) {
        await endGiveaway(interaction.client, messageId).catch(console.error);
      }

      return interaction.reply({
        content: TEXT.alreadyEnded,
        flags: EPHEMERAL,
      });
    }

    if (!g.entries.includes(userId)) {
      g.entries.push(userId);
      save();

      await interaction.reply({
        content: TEXT.entered,
        flags: EPHEMERAL,
      });

      refresh(interaction.client, messageId);
      return;
    }

    const section = new SectionBuilder()
      .addTextDisplayComponents(text(TEXT.confirmLeave))
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId(`gw_leave|${messageId}`)
          .setLabel(TEXT.leaveLabel)
          .setStyle(ButtonStyle.Danger)
      );

    return interaction.reply({
      components: [
        new ContainerBuilder().addSectionComponents(section),
      ],
      flags: EPHEMERAL | V2,
    });
  }

  if (action === 'gw_leave') {
    const g = data[targetId];

    if (!g || g.ended || Date.now() >= g.endsAt) {
      if (g && !g.ended) {
        await endGiveaway(interaction.client, targetId).catch(console.error);
      }

      return interaction.update({
        components: [
          new ContainerBuilder().addTextDisplayComponents(
            text(TEXT.alreadyEnded)
          ),
        ],
        flags: V2,
      });
    }

    if (!g.entries.includes(userId)) {
      return interaction.update({
        components: [
          new ContainerBuilder().addTextDisplayComponents(
            text('You are not entered in this giveaway.')
          ),
        ],
        flags: V2,
      });
    }

    g.entries = g.entries.filter((id) => id !== userId);
    save();

    refresh(interaction.client, targetId);

    return interaction.update({
      components: [
        new ContainerBuilder().addTextDisplayComponents(
          text(TEXT.left)
        ),
      ],
      flags: V2,
    });
  }
}

module.exports = {
  createGiveaway,
  handleGiveawayInteraction,
  resumeGiveaways,
  parseDuration,
};
