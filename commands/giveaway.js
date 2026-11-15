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

// ===== EDIT THESE =====
const BANNER_URL = 'https://example.com/banner.png';
const FOOTER_URL = 'https://cdn.phototourl.com/member/2026-11-15-92b4d11b-7a03-489d-9071-4fde46d0fafe.png';

const TEXT = {
  enterLabel: 'Enter Giveaway',
  endedLabel: 'Giveaway Ended',
  leaveLabel: 'Leave',

  // The giveaway message while it is running
  active: (g) =>
    `# 🎉 ${g.prize}\n` +
    `**Hosted by:** <@${g.hostId}>\n` +
    `**Ends:** <t:${Math.floor(g.endsAt / 1000)}:R>\n` +
    `**Winners:** ${g.winners}\n` +
    `**Entries:** ${g.entries.length}\n\n` +
    `Click the button below to enter!`,

  // The giveaway message once it has ended
  ended: (g) =>
    `# 🎉 ${g.prize}\n` +
    `**Hosted by:** <@${g.hostId}>\n` +
    `**Ended:** <t:${Math.floor(g.endsAt / 1000)}:R>\n` +
    `**Entries:** ${g.entries.length}\n\n` +
    (g.winnerIds.length
      ? `**Winner${g.winnerIds.length === 1 ? '' : 's'}:** ${g.winnerIds.map((id) => `<@${id}>`).join(', ')}`
      : '**Winners:** No valid entries'),

  // Message sent in the channel when it ends
  announceWinners: (g) =>
    `🎉 Congratulations ${g.winnerIds.map((id) => `<@${id}>`).join(', ')}! You won **${g.prize}**!`,
  announceNoEntries: (g) => `Nobody entered the giveaway for **${g.prize}**, so there are no winners.`,

  // Ephemeral messages
  entered: 'You have entered the giveaway. Good luck!',
  confirmLeave: "You're already in this giveaway.Do you want to leave it?",
  left: 'You have left the giveaway.',
  alreadyEnded: 'This giveaway has already ended.',
};
// ======================

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;

// ---------- storage ----------
const FILE = path.join(__dirname, 'giveaways.json');
let data = {};
try {
  data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch {
  data = {};
}
const save = () => fs.writeFileSync(FILE, JSON.stringify(data, null, 2));

// ---------- helpers ----------
const text = (t) => new TextDisplayBuilder().setContent(t);
const gallery = (url) =>
  new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(url));
const divider = () =>
  new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);

// "30m", "2h", "1d", "1w" -> milliseconds (10 seconds to 30 days)
function parseDuration(input) {
  const match = /^(\d+)\s*(s|m|h|d|w)$/i.exec(input.trim());
  if (!match) return null;
  const units = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
  const ms = Number(match[1]) * units[match[2].toLowerCase()];
  if (ms < 10_000 || ms > 30 * 86_400_000) return null;
  return ms;
}

// ---------- the giveaway container ----------
function buildGiveaway(g) {
  return new ContainerBuilder()
    .addMediaGalleryComponents(gallery(BANNER_URL))
    .addTextDisplayComponents(text(g.ended ? TEXT.ended(g) : TEXT.active(g)))
    .addSeparatorComponents(divider())
    .addMediaGalleryComponents(gallery(FOOTER_URL))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('gw_enter')
          .setLabel(g.ended ? TEXT.endedLabel : TEXT.enterLabel)
          .setEmoji('🎉')
          .setStyle(g.ended ? ButtonStyle.Secondary : ButtonStyle.Success)
          .setDisabled(g.ended)
      )
    );
}

// ---------- editing the giveaway message ----------
async function fetchGiveawayMessage(client, g, messageId) {
  const channel = await client.channels.fetch(g.channelId).catch(() => null);
  if (!channel) return null;
  return channel.messages.fetch(messageId).catch(() => null);
}

// Entry count updates are batched so lots of clicks don't spam edits
const refreshTimers = new Map();
function refresh(client, messageId) {
  if (refreshTimers.has(messageId)) return;
  refreshTimers.set(
    messageId,
    setTimeout(async () => {
      refreshTimers.delete(messageId);
      const g = data[messageId];
      if (!g || g.ended) return;
      const message = await fetchGiveawayMessage(client, g, messageId);
      if (message) {
        await message.edit({ components: [buildGiveaway(g)], flags: V2 }).catch(console.error);
      }
    }, 2000)
  );
}

// ---------- ending ----------
const endTimers = new Map();

function schedule(client, messageId) {
  const g = data[messageId];
  if (!g || g.ended) return;
  clearTimeout(endTimers.get(messageId));

  // setTimeout can't wait longer than ~24 days, so wait in chunks
  const wait = Math.min(Math.max(g.endsAt - Date.now(), 0), 2_000_000_000);
  endTimers.set(
    messageId,
    setTimeout(() => {
      if (Date.now() >= g.endsAt) endGiveaway(client, messageId).catch(console.error);
      else schedule(client, messageId);
    }, wait)
  );
}

async function endGiveaway(client, messageId) {
  const g = data[messageId];
  if (!g || g.ended) return;

  // pick winners at random, no repeats
  const pool = [...g.entries];
  g.winnerIds = [];
  while (pool.length && g.winnerIds.length < g.winners) {
    g.winnerIds.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  g.ended = true;
  save();

  const message = await fetchGiveawayMessage(client, g, messageId);
  if (!message) return;

  await message.edit({ components: [buildGiveaway(g)], flags: V2 }).catch(console.error);
  await message
    .reply({
      content: g.winnerIds.length ? TEXT.announceWinners(g) : TEXT.announceNoEntries(g),
      allowedMentions: { users: g.winnerIds },
    })
    .catch(console.error);
}

// ---------- public: start a giveaway ----------
async function createGiveaway(channel, { prize, hostId, winners, durationMs }) {
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

  const message = await channel.send({ components: [buildGiveaway(g)], flags: V2 });
  data[message.id] = g;
  save();
  schedule(channel.client, message.id);
  return message;
}

// ---------- public: call once when the bot starts ----------
function resumeGiveaways(client) {
  for (const id of Object.keys(data)) schedule(client, id);
}

// ---------- public: button handler ----------
async function handleGiveawayInteraction(interaction) {
  const [action, targetId] = interaction.customId.split('|');
  const userId = interaction.user.id;

  // ===== Enter button on the giveaway =====
  if (action === 'gw_enter') {
    const messageId = interaction.message.id;
    const g = data[messageId];
    if (!g || g.ended) {
      return interaction.reply({ content: TEXT.alreadyEnded, flags: EPHEMERAL });
    }

    // first click: enter
    if (!g.entries.includes(userId)) {
      g.entries.push(userId);
      save();
      await interaction.reply({ content: TEXT.entered, flags: EPHEMERAL });
      refresh(interaction.client, messageId);
      return;
    }

    // second click: ask to confirm leaving (button sits beside the text)
    const section = new SectionBuilder()
      .addTextDisplayComponents(text(TEXT.confirmLeave))
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId(`gw_leave|${messageId}`)
          .setLabel(TEXT.leaveLabel)
          .setStyle(ButtonStyle.Danger)
      );

    return interaction.reply({
      components: [new ContainerBuilder().addSectionComponents(section)],
      flags: EPHEMERAL | V2,
    });
  }

  // ===== Leave button on the ephemeral confirmation =====
  if (action === 'gw_leave') {
    const g = data[targetId];
    if (!g || g.ended) {
      return interaction.update({
        components: [new ContainerBuilder().addTextDisplayComponents(text(TEXT.alreadyEnded))],
        flags: V2,
      });
    }

    g.entries = g.entries.filter((id) => id !== userId);
    save();
    refresh(interaction.client, targetId);

    return interaction.update({
      components: [new ContainerBuilder().addTextDisplayComponents(text(TEXT.left))],
      flags: V2,
    });
  }
}

module.exports = { createGiveaway, handleGiveawayInteraction, resumeGiveaways, parseDuration };