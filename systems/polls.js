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
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require('discord.js');

// ===== EDIT THESE =====
const FOOTER_URL = 'https://cdn.phototourl.com/member/2026-11-15-92b4d11b-7a03-489d-9071-4fde46d0fafe.png';

const TEXT = {
  header: (p) =>
    `# ${p.question}\n` +
    `**Asked by:** <@${p.hostId}>` +
    (p.endsAt
      ? `\n**${p.ended ? 'Ended' : 'Ends'}:** <t:${Math.floor(p.endsAt / 1000)}:R>`
      : ''),
  total: (n) => `**Total votes:** ${n}`,
  closed: 'This poll has ended.',
};
// ======================

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;

// ---------- storage ----------
const FILE = path.join(__dirname, 'polls.json');
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

// votes are stored as { userId: optionIndex }
function tally(p) {
  const counts = p.options.map(() => 0);
  for (const choice of Object.values(p.votes)) counts[choice] += 1;
  return counts;
}

function resultsText(p) {
  const counts = tally(p);
  const total = counts.reduce((a, b) => a + b, 0);

  const lines = p.options.map((option, i) => {
    const pct = total ? Math.round((counts[i] / total) * 100) : 0;
    const filled = Math.round(pct / 10);
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
    return `**${option}**\n${bar} ${counts[i]} vote${counts[i] === 1 ? '' : 's'} (${pct}%)`;
  });

  return `${lines.join('\n\n')}\n\n${TEXT.total(total)}`;
}

// ---------- the poll container ----------
function buildPoll(p) {
  return new ContainerBuilder()
    .addTextDisplayComponents(text(`${TEXT.header(p)}\n\n${resultsText(p)}`))
    .addSeparatorComponents(divider())
    .addMediaGalleryComponents(gallery(FOOTER_URL))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        p.options.map((option, i) =>
          new ButtonBuilder()
            .setCustomId(`poll_vote|${i}`)
            .setLabel(option.slice(0, 80))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(p.ended)
        )
      )
    );
}

// ---------- ending ----------
const endTimers = new Map();

function schedule(client, messageId) {
  const p = data[messageId];
  if (!p || p.ended || !p.endsAt) return;
  clearTimeout(endTimers.get(messageId));

  // setTimeout can't wait longer than ~24 days, so wait in chunks
  const wait = Math.min(Math.max(p.endsAt - Date.now(), 0), 2_000_000_000);
  endTimers.set(
    messageId,
    setTimeout(() => {
      if (Date.now() >= p.endsAt) endPoll(client, messageId).catch(console.error);
      else schedule(client, messageId);
    }, wait)
  );
}

async function endPoll(client, messageId) {
  const p = data[messageId];
  if (!p || p.ended) return;
  p.ended = true;
  save();

  const channel = await client.channels.fetch(p.channelId).catch(() => null);
  const message = channel ? await channel.messages.fetch(messageId).catch(() => null) : null;
  if (!message) return;

  await message.edit({ components: [buildPoll(p)], flags: V2 }).catch(console.error);
}

// ---------- public: start a poll ----------
async function createPoll(channel, { question, options, hostId, durationMs }) {
  const p = {
    guildId: channel.guild.id,
    channelId: channel.id,
    question,
    options,
    hostId,
    endsAt: durationMs ? Date.now() + durationMs : null,
    votes: {},
    ended: false,
  };

  const message = await channel.send({ components: [buildPoll(p)], flags: V2 });
  data[message.id] = p;
  save();
  schedule(channel.client, message.id);
  return message;
}

// ---------- public: call once when the bot starts ----------
function resumePolls(client) {
  for (const id of Object.keys(data)) schedule(client, id);
}

// ---------- public: button handler ----------
async function handlePollInteraction(interaction) {
  const [action, index] = interaction.customId.split('|');
  if (action !== 'poll_vote') return;

  const p = data[interaction.message.id];
  if (!p || p.ended) {
    return interaction.reply({ content: TEXT.closed, flags: EPHEMERAL });
  }

  const choice = Number(index);
  const userId = interaction.user.id;

  // clicking your current choice removes your vote, clicking another one moves it
  if (p.votes[userId] === choice) delete p.votes[userId];
  else p.votes[userId] = choice;
  save();

  return interaction.update({ components: [buildPoll(p)], flags: V2 });
}

module.exports = { createPoll, handlePollInteraction, resumePolls, parseDuration };