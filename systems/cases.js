const fs = require('node:fs');
const path = require('node:path');
const {
  PermissionFlagsBits,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
} = require('discord.js');

// ===== EDIT THESE =====
const LOG_CHANNEL_ID = '1474592958291640330';
const PREFIX = '^';
const LOG_EVENTS = true; // false = only log closed tickets/orders
const FOOTER_URL = 'https://cdn.phototourl.com/member/2026-11-15-92b4d11b-7a03-489d-9071-4fde46d0fafe.png';

// Roles that can use /ticket-lookup, /ticket-list and /purchase-log
// (people with Manage Channels or Administrator always can)
const STAFF_ROLE_IDS = ['1479503457441284289'];

const KINDS = {
  order: { prefix: 'ORD', label: 'Order' },
  ticket: { prefix: 'SUP', label: 'Support' },
  application: { prefix: 'APP', label: 'Application' },
};
// ======================

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;
const GAP = '\u2003\u2003';
const PER_PAGE = 8;
const MAX_MESSAGES = 1500;

// ---------- small helpers ----------
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nowSec = () => Math.floor(Date.now() / 1000);
const text = (t) => new TextDisplayBuilder().setContent(t);
const divider = () =>
  new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
const footer = () =>
  new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(FOOTER_URL));
const truncate = (value, max) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);
const labelOf = (record) => KINDS[record.kind]?.label ?? record.kind;
const statusLabel = (record) =>
  record.status === 'open' ? '🟢 Open' : record.status === 'closing' ? '🟠 Closing' : '🔴 Closed';

// ---------- storage ----------
const DATA_DIR = path.join(__dirname, '..', 'data');
const TRANSCRIPT_DIR = path.join(DATA_DIR, 'transcripts');
const CASES_FILE = path.join(DATA_DIR, 'cases.json');
fs.mkdirSync(TRANSCRIPT_DIR, { recursive: true });

let cases = {};
try {
  cases = JSON.parse(fs.readFileSync(CASES_FILE, 'utf8'));
} catch {
  cases = {};
}
const saveCases = () => fs.writeFileSync(CASES_FILE, JSON.stringify(cases, null, 2));

const getById = (id) => cases[String(id || '').trim().toUpperCase()] ?? null;
const allCases = () => Object.values(cases);
const getByChannel = (channelId) =>
  allCases().find((c) => c.status === 'open' && c.channelId === channelId) ?? null;

function updateCase(id, patch) {
  Object.assign(cases[id], patch);
  saveCases();
  return cases[id];
}

function newId(kind) {
  const prefix = KINDS[kind]?.prefix ?? kind.slice(0, 3).toUpperCase();
  let id;
  do {
    id = `${prefix}-${Math.floor(10000 + Math.random() * 90000)}`;
  } while (cases[id]);
  return id;
}

// An open case whose channel was deleted by hand is treated as closed
function findOpenByOpener(kind, openerId, guild) {
  for (const c of allCases()) {
    if (c.kind !== kind || c.status !== 'open' || c.openerId !== openerId) continue;
    if (guild.channels.cache.has(c.channelId)) return c;
    Object.assign(c, { status: 'closed', closedAt: nowSec(), closeReason: 'Channel deleted' });
    saveCases();
  }
  return null;
}

// ---------- hooks other systems register ----------
const renderers = {};
const closeHooks = {};
const registerRenderer = (kind, fn) => {
  renderers[kind] = fn;
};
const onClose = (kind, fn) => {
  closeHooks[kind] = fn;
};

// ---------- permissions ----------
const isManager = (member) =>
  member.permissions.has(PermissionFlagsBits.Administrator) ||
  member.permissions.has(PermissionFlagsBits.ManageChannels);
const hasStaffRole = (member) => STAFF_ROLE_IDS.some((id) => member.roles.cache.has(id));
const canLookup = (member) => isManager(member) || hasStaffRole(member);
const canManageCase = (member, record) =>
  isManager(member) ||
  hasStaffRole(member) ||
  (record.staffRoleId && member.roles.cache.has(record.staffRoleId));
const canClose = (member, record) => member.id === record.openerId || canManageCase(member, record);

// ---------- sending to channels ----------
async function sendTo(client, channelId, container, mentions = { parse: [] }) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || !channel.send) {
      console.error(`[Cases] Channel ${channelId} can't receive messages.`);
      return false;
    }
    await channel.send({ components: [container], flags: V2, allowedMentions: mentions });
    return true;
  } catch (error) {
    console.error(`[Cases] Could not send to ${channelId}:`, error);
    return false;
  }
}

function logEvent(client, content) {
  if (!LOG_EVENTS) return Promise.resolve(false);
  return sendTo(
    client,
    LOG_CHANNEL_ID,
    new ContainerBuilder()
      .addTextDisplayComponents(text(content))
      .addSeparatorComponents(divider())
      .addMediaGalleryComponents(footer())
  );
}

function buildLog(record) {
  const body = [
    `**Lookup ID:** ${record.id}${GAP}**Type:** ${labelOf(record)}`,
    `**Opener:** <@${record.openerId}>${GAP}**Claimed By:** ${record.claimedBy ? `<@${record.claimedBy}>` : 'Nobody'}`,
    `**Date Opened:** <t:${record.openedAt}:f>${GAP}**Closed By:** ${record.closedBy ? `<@${record.closedBy}>` : 'Unknown'}`,
    `**Reason for Closure:** ${record.closeReason || 'N/A'}${GAP}**Transcript Saved:** ${record.transcriptSaved ? 'Y' : 'N'}`,
  ].join('\n');

  return new ContainerBuilder()
    .addTextDisplayComponents(text(body))
    .addSeparatorComponents(divider())
    .addMediaGalleryComponents(footer());
}

// ---------- the welcome message (rebuilt when claimed/unclaimed) ----------
async function refreshWelcome(client, id) {
  const record = cases[id];
  const render = renderers[record?.kind];
  if (!record || !render || !record.welcomeMessageId) return;

  try {
    const channel = await client.channels.fetch(record.channelId);
    const message = await channel.messages.fetch(record.welcomeMessageId);
    await message.edit({ components: [render(record)], flags: V2 });
  } catch (error) {
    console.error('[Cases] Could not refresh the welcome message:', error);
  }
}

// ---------- opening ----------
async function openCase(client, { kind, channel, opener, staffRoleId = null, reason = null }) {
  const record = {
    id: newId(kind),
    kind,
    guildId: channel.guild.id,
    channelId: channel.id,
    openerId: opener.id,
    openerName: opener.username,
    openedAt: nowSec(),
    status: 'open',
    staffRoleId,
    claimedBy: null,
    closedBy: null,
    closedAt: null,
    closeReason: null,
    transcriptSaved: false,
    reason,
    welcomeMessageId: null,
  };

  cases[record.id] = record;
  saveCases();

  await logEvent(
    client,
    `🟢 **${record.id}** (${labelOf(record)}) opened by <@${record.openerId}> in <#${record.channelId}>`
  );

  return record;
}

// ---------- claim / unclaim / rename ----------
const fail = (message) => ({ ok: false, message });

async function claimCase(client, channel, member) {
  const record = getByChannel(channel.id);
  if (!record) return fail('This is not an active ticket, order or application channel.');
  if (!canManageCase(member, record)) return fail('Only staff can claim this.');
  if (record.claimedBy) return fail(`This is already claimed by <@${record.claimedBy}>.`);

  updateCase(record.id, { claimedBy: member.id });
  await refreshWelcome(client, record.id);
  await logEvent(client, `🙋 **${record.id}** claimed by <@${member.id}> in <#${channel.id}>`);

  return { ok: true, message: `<@${member.id}> has claimed this ${labelOf(record).toLowerCase()}.` };
}

async function unclaimCase(client, channel, member) {
  const record = getByChannel(channel.id);
  if (!record) return fail('This is not an active ticket, order or application channel.');
  if (!record.claimedBy) return fail('Nobody has claimed this.');
  if (record.claimedBy !== member.id && !isManager(member)) {
    return fail('Only the staff member who claimed this (or a manager) can unclaim it.');
  }

  updateCase(record.id, { claimedBy: null });
  await refreshWelcome(client, record.id);
  await logEvent(client, `↩️ **${record.id}** unclaimed by <@${member.id}> in <#${channel.id}>`);

  return { ok: true, message: `<@${member.id}> has unclaimed this ${labelOf(record).toLowerCase()}.` };
}

async function renameCase(client, channel, member, input) {
  const record = getByChannel(channel.id);
  if (!record) return fail('This is not an active ticket, order or application channel.');
  if (!canManageCase(member, record)) return fail('Only staff can rename this.');

  const name = String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9\-_ ]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 100);

  if (!name) return fail('Usage: `' + PREFIX + 'rename new-name`');

  const old = channel.name;
  await channel.setName(name, `Renamed by ${member.user.tag}`);
  await logEvent(client, `✏️ **${record.id}** renamed from \`${old}\` to \`${name}\` by <@${member.id}>`);

  return { ok: true, message: `Renamed this channel to \`${name}\`.` };
}

// ---------- transcripts ----------
function collectText(components = [], output = []) {
  for (const component of components) {
    if (typeof component.content === 'string') output.push(component.content);
    if (component.components) collectText(component.components, output);
  }
  return output;
}

const messageText = (message) =>
  message.cleanContent || collectText(message.components).join('\n');

async function saveTranscript(channel, id) {
  try {
    const collected = [];
    let before;

    while (collected.length < MAX_MESSAGES) {
      const batch = await channel.messages.fetch({ limit: 100, before });
      if (!batch.size) break;
      collected.push(...batch.values());
      before = batch.last().id;
      if (batch.size < 100) break;
    }

    const messages = collected.reverse().map((message) => ({
      authorId: message.author.id,
      author: message.author.username,
      bot: message.author.bot,
      timestamp: message.createdTimestamp,
      content: messageText(message),
      attachments: [...message.attachments.values()].map((a) => ({ name: a.name, url: a.url })),
    }));

    fs.writeFileSync(
      path.join(TRANSCRIPT_DIR, `${id}.json`),
      JSON.stringify({ id, savedAt: Date.now(), messages }, null, 2)
    );

    return true;
  } catch (error) {
    console.error('[Cases] Transcript save failed:', error);
    return false;
  }
}

function loadTranscript(id) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(TRANSCRIPT_DIR, `${id}.json`), 'utf8'));
    return data?.messages ? data : null;
  } catch {
    return null;
  }
}

function transcriptPages(data) {
  const pages = [];
  let current = '';

  for (const message of data.messages) {
    let entry =
      `**${message.author}** <t:${Math.floor(message.timestamp / 1000)}:t>\n` +
      `${truncate(message.content || '*(no text)*', 600)}`;

    if (message.attachments?.length) {
      entry += `\nAttachments: ${message.attachments.map((a) => a.name).join(', ')}`;
    }
    entry += '\n\n';

    if (current.length + entry.length > 3000) {
      if (current) pages.push(current);
      current = '';
    }
    current += entry;
  }

  if (current || !pages.length) pages.push(current || '*This transcript is empty.*');
  return pages;
}

const esc = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function transcriptHtml(record, data) {
  const rows = data.messages
    .map((message) => {
      const when = new Date(message.timestamp).toUTCString();
      const files = (message.attachments || [])
        .map((a) => `<div class="file"><a href="${esc(a.url)}">${esc(a.name)}</a></div>`)
        .join('');

      return `
<div class="msg">
  <span class="author${message.bot ? ' bot' : ''}">${esc(message.author)}</span>
  <span class="time">${when}</span>
  <div class="text">${esc(message.content || '')}</div>
  ${files}
</div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Transcript ${esc(record.id)}</title>
<style>
body{background:#1e1f22;color:#dbdee1;font-family:system-ui,sans-serif;max-width:900px;margin:0 auto;padding:24px}
h1{font-size:20px;margin:0 0 4px}
.meta{color:#949ba4;margin-bottom:20px;font-size:14px}
.msg{padding:8px 0;border-bottom:1px solid #2b2d31}
.author{font-weight:600;color:#fff}
.author.bot{color:#5865f2}
.time{color:#949ba4;font-size:12px;margin-left:6px}
.text{white-space:pre-wrap;margin-top:2px}
.file a{color:#00a8fc}
</style>
</head>
<body>
<h1>Transcript ${esc(record.id)}</h1>
<div class="meta">${esc(labelOf(record))} opened by ${esc(record.openerName)} on ${new Date(record.openedAt * 1000).toUTCString()}</div>
${rows}
</body>
</html>`;
}

// ---------- closing ----------
async function closeCase(client, channel, closer, reason) {
  const record = getByChannel(channel.id);
  if (!record) return;

  updateCase(record.id, { status: 'closing' });

  const transcriptSaved = await saveTranscript(channel, record.id);
  const closed = updateCase(record.id, {
    status: 'closed',
    closedBy: closer.id,
    closedAt: nowSec(),
    closeReason: reason || null,
    transcriptSaved,
  });

  await sendTo(client, LOG_CHANNEL_ID, buildLog(closed));

  try {
    closeHooks[closed.kind]?.(closed);
  } catch (error) {
    console.error('[Cases] Close hook failed:', error);
  }

  await sleep(3000);
  await channel
    .delete(`${closed.id} closed by ${closer.tag ?? closer.username}`)
    .catch(console.error);
}

// A ticket/order channel deleted by hand still gets logged
async function handleChannelDelete(channel) {
  const record = getByChannel(channel.id);
  if (!record) return;

  const closed = updateCase(record.id, {
    status: 'closed',
    closedAt: nowSec(),
    closeReason: 'Channel deleted',
    transcriptSaved: false,
  });

  try {
    closeHooks[closed.kind]?.(closed);
  } catch (error) {
    console.error('[Cases] Close hook failed:', error);
  }

  await sendTo(channel.client, LOG_CHANNEL_ID, buildLog(closed));
}

// ---------- lookup view ----------
function buildLookup(record) {
  const channel = record.status === 'open' ? `<#${record.channelId}>` : 'Channel closed';

  const lines = [
    `# ${labelOf(record)} Lookup: ${record.id}`,
    '',
    `**Type:** ${labelOf(record)}`,
    `**Status:** ${statusLabel(record)}`,
    `**Channel:** ${channel}`,
    `**Opener:** <@${record.openerId}>`,
    `**Opener Username:** ${record.openerName || 'Unknown'}`,
    `**Opened:** <t:${record.openedAt}:F>`,
    `**Claimed By:** ${record.claimedBy ? `<@${record.claimedBy}>` : 'Nobody'}`,
    `**Closed By:** ${record.closedBy ? `<@${record.closedBy}>` : 'N/A'}`,
    `**Closed At:** ${record.closedAt ? `<t:${record.closedAt}:F>` : 'Not closed'}`,
    `**Close Reason:** ${record.closeReason || 'N/A'}`,
    `**Transcript Saved:** ${record.transcriptSaved ? 'Yes' : 'No'}`,
  ];
  if (record.reason) lines.push('', `**Opening Reason:** ${record.reason}`);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(lines.join('\n')))
    .addSeparatorComponents(divider());

  if (record.transcriptSaved) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`case_txopen|${record.id}`)
          .setLabel('View Transcript')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`case_html|${record.id}`)
          .setLabel('Download Transcript')
          .setStyle(ButtonStyle.Secondary)
      )
    );
  }

  return container.addMediaGalleryComponents(footer());
}

function transcriptNav(id, current, pages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`case_tx|${id}|${current - 1}`)
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(current === 0),
    new ButtonBuilder()
      .setCustomId('case_tx|page|0')
      .setLabel(`Page ${current + 1}/${pages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`case_tx|${id}|${current + 1}`)
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(current >= pages - 1)
  );
}

function buildTranscriptView(record, data, page) {
  const pages = transcriptPages(data);
  const current = Math.min(Math.max(page, 0), pages.length - 1);

  return new ContainerBuilder()
    .addTextDisplayComponents(text(`# Transcript ${record.id}\n\n${pages[current]}`))
    .addSeparatorComponents(divider())
    .addActionRowComponents(transcriptNav(record.id, current, pages.length))
    .addMediaGalleryComponents(footer());
}

// ---------- list view ----------
function filterCases({ type = 'all', status = 'all', userId = null }) {
  return allCases()
    .filter((c) => type === 'all' || c.kind === type)
    .filter((c) => status === 'all' || (status === 'closed' ? c.status === 'closed' : c.status !== 'closed'))
    .filter((c) => !userId || c.openerId === userId)
    .sort((a, b) => b.openedAt - a.openedAt);
}

function buildList(filters, page, viewerId) {
  const list = filterCases(filters);
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const current = Math.min(Math.max(page, 0), pages - 1);
  const slice = list.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE);

  const { type = 'all', status = 'all', userId = null } = filters;
  const state = `${type}|${status}|${userId ?? '-'}|${viewerId}`;

  const lines = slice.map(
    (c) => `**${c.id}** - ${statusLabel(c)} - ${labelOf(c)} - <@${c.openerId}> - <t:${c.openedAt}:d>`
  );

  const header =
    `# Tickets, Orders & Applications\n` +
    `**Showing:** ${type} • ${status}${userId ? ` • <@${userId}>` : ''} - **${list.length}** found\n\n`;

  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(header + (lines.join('\n') || 'Nothing found.')))
    .addSeparatorComponents(divider());

  if (slice.length) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`case_pick|${current}|${state}`)
          .setPlaceholder('Pick one to view details and transcript')
          .addOptions(
            slice.map((c) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(c.id)
                .setDescription(truncate(`${labelOf(c)} - ${c.status} - ${c.openerName || 'Unknown'}`, 100))
                .setValue(c.id)
            )
          )
      )
    );
  }

  container
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`case_list|${current - 1}|${state}`)
          .setLabel('Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(current === 0),
        new ButtonBuilder()
          .setCustomId('case_list|page|0')
          .setLabel(`Page ${current + 1}/${pages}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`case_list|${current + 1}|${state}`)
          .setLabel('Next')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(current >= pages - 1)
      )
    )
    .addMediaGalleryComponents(footer());

  return container;
}

function parseListState(parts) {
  const [type, status, user, viewerId] = parts;
  return { filters: { type, status, userId: user === '-' ? null : user }, viewerId };
}

// ---------- button / dropdown / modal handler ----------
async function handleCaseInteraction(interaction) {
  const [action, a, b, c, d, e] = interaction.customId.split('|');
  const deny = (content) => interaction.reply({ content, flags: EPHEMERAL });

  // ===== Claim / Unclaim buttons =====
  if (action === 'case_claim' || action === 'case_unclaim') {
    await interaction.deferUpdate();

    const run = action === 'case_claim' ? claimCase : unclaimCase;
    const result = await run(interaction.client, interaction.channel, interaction.member);

    return interaction.followUp(
      result.ok
        ? { content: result.message, allowedMentions: { parse: [] } }
        : { content: result.message, flags: EPHEMERAL }
    );
  }

  // ===== Close button -> ask for a reason =====
  if (action === 'case_close') {
    const record = getByChannel(interaction.channel.id);
    if (!record) return deny('This is not an active ticket, order or application channel.');
    if (!canClose(interaction.member, record)) return deny("You can't close this.");

    const modal = new ModalBuilder()
      .setCustomId('case_closemodal')
      .setTitle(`Close ${labelOf(record)}`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('Reason for closing (optional)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(500)
        )
      );

    return interaction.showModal(modal);
  }

  // ===== Close modal submitted =====
  if (action === 'case_closemodal') {
    const record = getByChannel(interaction.channel.id);
    if (!record) return deny('This is not an active ticket, order or application channel.');
    if (!canClose(interaction.member, record)) return deny("You can't close this.");

    const reason = interaction.fields.getTextInputValue('reason').trim() || null;

    await interaction.reply(`Saving the transcript and closing this ${labelOf(record).toLowerCase()}...`);
    return closeCase(interaction.client, interaction.channel, interaction.user, reason);
  }

  // ===== everything below is staff-only lookup tools =====
  if (!canLookup(interaction.member)) return deny('You do not have permission to use this.');

  // ===== View transcript (first page) =====
  if (action === 'case_txopen') {
    const record = getById(a);
    const data = record && loadTranscript(record.id);
    if (!data) return deny('No transcript was found for that ID.');

    return interaction.reply({
      components: [buildTranscriptView(record, data, 0)],
      flags: EPHEMERAL | V2,
      allowedMentions: { parse: [] },
    });
  }

  // ===== Transcript page buttons =====
  if (action === 'case_tx') {
    const record = getById(a);
    const data = record && loadTranscript(record.id);
    if (!data) return deny('No transcript was found for that ID.');

    return interaction.update({
      components: [buildTranscriptView(record, data, Number(b))],
      allowedMentions: { parse: [] },
    });
  }

  // ===== Download transcript as HTML =====
  if (action === 'case_html') {
    const record = getById(a);
    const data = record && loadTranscript(record.id);
    if (!data) return deny('No transcript was found for that ID.');

    const file = new AttachmentBuilder(Buffer.from(transcriptHtml(record, data), 'utf8'), {
      name: `transcript-${record.id}.html`,
    });

    return interaction.reply({
      content: `Transcript for **${record.id}**`,
      files: [file],
      flags: EPHEMERAL,
    });
  }

  // ===== List page buttons =====
  if (action === 'case_list') {
    const { filters, viewerId } = parseListState([b, c, d, e]);
    if (interaction.user.id !== viewerId) return deny('Only the person who ran this command can use these buttons.');

    return interaction.update({
      components: [buildList(filters, Number(a), viewerId)],
      allowedMentions: { parse: [] },
    });
  }

  // ===== Pick one from the list =====
  if (action === 'case_pick' && interaction.isStringSelectMenu()) {
    const { filters, viewerId } = parseListState([b, c, d, e]);
    if (interaction.user.id !== viewerId) return deny('Only the person who ran this command can use this menu.');

    const record = getById(interaction.values[0]);
    if (!record) return deny('That case no longer exists.');

    // resets the dropdown so the same one can be picked again
    await interaction.update({
      components: [buildList(filters, Number(a), viewerId)],
      allowedMentions: { parse: [] },
    });

    return interaction.followUp({
      components: [buildLookup(record)],
      flags: EPHEMERAL | V2,
      allowedMentions: { parse: [] },
    });
  }
}

// ---------- prefix commands (^claim ^unclaim ^close ^rename) ----------
async function handlePrefixCommand(message) {
  if (!message.guild || message.author.bot || !message.content.startsWith(PREFIX)) return;

  const [command, ...args] = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const name = (command || '').toLowerCase();
  if (!['claim', 'unclaim', 'close', 'rename'].includes(name)) return;

  const record = getByChannel(message.channel.id);
  if (!record) return;

  const member =
    message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member) return;

  const reply = (content) =>
    message.reply({ content, allowedMentions: { parse: [], repliedUser: false } });

  if (name === 'claim') {
    return reply((await claimCase(message.client, message.channel, member)).message);
  }

  if (name === 'unclaim') {
    return reply((await unclaimCase(message.client, message.channel, member)).message);
  }

  if (name === 'rename') {
    return reply((await renameCase(message.client, message.channel, member, args.join(' '))).message);
  }

  if (!canClose(member, record)) return reply("You can't close this.");

  await reply(`Saving the transcript and closing this ${labelOf(record).toLowerCase()}...`);
  return closeCase(message.client, message.channel, message.author, args.join(' ') || null);
}

module.exports = {
  FOOTER_URL,
  text,
  divider,
  footer,
  sendTo,
  openCase,
  updateCase,
  getById,
  getByChannel,
  allCases,
  findOpenByOpener,
  registerRenderer,
  onClose,
  canLookup,
  canManageCase,
  canClose,
  claimCase,
  unclaimCase,
  closeCase,
  logEvent,
  labelOf,
  buildLookup,
  buildList,
  handleCaseInteraction,
  handlePrefixCommand,
  handleChannelDelete,
};