const fs = require('node:fs');
const path = require('node:path');
const { SlashCommandBuilder, MessageFlags, ContainerBuilder } = require('discord.js');

const {
  text,
  divider,
  footer,
  sendTo,
  getByChannel,
  updateCase,
  canLookup,
} = require('../systems/cases');

// ===== EDIT THESE =====
const PURCHASE_LOG_CHANNEL_ID = '1474147915323805871';
const THANK_YOU_CHANNEL_ID = '1571783779117174824';
// ======================

const GAP = '  ';
const nowSec = () => Math.floor(Date.now() / 1000);

// ---------- storage ----------
const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'purchases.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

let purchases = {};
try {
  purchases = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch {
  purchases = {};
}
const save = () => fs.writeFileSync(FILE, JSON.stringify(purchases, null, 2));

function newId() {
  let id;
  do {
    id = `PUR-${Math.floor(10000 + Math.random() * 90000)}`;
  } while (purchases[id]);
  return id;
}

// ---------- the actual logging ----------
async function logPurchase(client, { buyerId, staffId, item, amount, caseId }) {
  const purchase = {
    id: newId(),
    buyerId,
    staffId,
    item,
    amount: amount || null,
    caseId: caseId || null,
    loggedAt: nowSec(),
  };

  purchases[purchase.id] = purchase;
  save();

  const logBody = [
    `**Purchase ID:** ${purchase.id}${GAP}**Order:** ${purchase.caseId ?? 'N/A'}`,
    `**Buyer:** <@${buyerId}>${GAP}**Confirmed By:** <@${staffId}>`,
    `**Item:** ${item}${GAP}**Amount:** ${purchase.amount ?? 'N/A'}`,
    `**Date:** <t:${purchase.loggedAt}:f>`,
  ].join('\n');

  const logged = await sendTo(
    client,
    PURCHASE_LOG_CHANNEL_ID,
    new ContainerBuilder()
      .addTextDisplayComponents(text(logBody))
      .addSeparatorComponents(divider())
      .addMediaGalleryComponents(footer())
  );

  // the buyer is pinged here so they see their thank you
  const thanked = await sendTo(
    client,
    THANK_YOU_CHANNEL_ID,
    new ContainerBuilder()
      .addTextDisplayComponents(
        text(
          `# Thank you for your purchase!\n` +
            `Thank you <@${buyerId}> for purchasing **${item}**. We really appreciate your support!`
        )
      )
      .addSeparatorComponents(divider())
      .addMediaGalleryComponents(footer()),
    { users: [buyerId] }
  );

  if (purchase.caseId) updateCase(purchase.caseId, { purchaseId: purchase.id });

  return { purchase, logged, thanked };
}

function summary({ purchase, logged, thanked }) {
  const problems = [];
  if (!logged) problems.push('the purchase log');
  if (!thanked) problems.push('the thank you message');

  return problems.length
    ? `Saved **${purchase.id}**, but I couldn't send ${problems.join(' or ')}. Check my permissions in those channels.`
    : `Purchase **${purchase.id}** logged and the thank you message was sent.`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purchase-log')
    .setDescription('Log a confirmed purchase and send the buyer a thank you')
    .addStringOption((o) =>
      o.setName('item').setDescription('What was purchased').setRequired(true).setMaxLength(200)
    )
    .addStringOption((o) =>
      o.setName('amount').setDescription('Price or amount paid (optional)').setMaxLength(50)
    )
    .addUserOption((o) =>
      o.setName('buyer').setDescription('Defaults to whoever opened this order')
    ),

  async execute(interaction) {
    if (!canLookup(interaction.member)) {
      return interaction.reply({
        content: 'You do not have permission to use this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const record = getByChannel(interaction.channelId);
    const buyer = interaction.options.getUser('buyer');
    const buyerId = buyer?.id ?? (record?.kind === 'order' ? record.openerId : null);

    if (!buyerId) {
      return interaction.reply({
        content: 'Run this inside an order, or pick a `buyer`.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const result = await logPurchase(interaction.client, {
      buyerId,
      staffId: interaction.user.id,
      item: interaction.options.getString('item').trim(),
      amount: interaction.options.getString('amount')?.trim(),
      caseId: record?.kind === 'order' ? record.id : null,
    });

    return interaction.editReply({ content: summary(result), allowedMentions: { parse: [] } });
  },

  // ^purchase-log [@buyer] <item> [| amount]
  async prefix(message, args) {
    if (!message.member || !canLookup(message.member)) {
      return message.reply('You do not have permission to use this command.');
    }

    const record = getByChannel(message.channel.id);
    const buyerId =
      message.mentions.users.first()?.id ?? (record?.kind === 'order' ? record.openerId : null);

    const [itemPart, amountPart] = args
      .filter((a) => !/^<@!?\d+>$/.test(a))
      .join(' ')
      .split('|')
      .map((s) => s.trim());

    if (!itemPart || !buyerId) {
      return message.reply(
        'Usage: `^purchase-log [@buyer] <item> | <amount>`\n' +
          'Inside an order the buyer is picked automatically. The amount is optional.'
      );
    }

    const result = await logPurchase(message.client, {
      buyerId,
      staffId: message.author.id,
      item: itemPart.slice(0, 200),
      amount: amountPart?.slice(0, 50),
      caseId: record?.kind === 'order' ? record.id : null,
    });

    return message.reply({
      content: summary(result),
      allowedMentions: { parse: [], repliedUser: false },
    });
  },
};