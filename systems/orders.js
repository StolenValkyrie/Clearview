const {
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const store = require('../store');

// ===== EDIT THESE =====
const BANNER_URL = 'https://cdn.phototourl.com/member/2026-11-14-45974b59-6584-47bd-b466-cd5f197fa967.png';
const FOOTER_URL = 'https://cdn.phototourl.com/member/2026-11-15-92b4d11b-7a03-489d-9071-4fde46d0fafe.png';

// Shown when someone clicks "Order Info"
const RULES_TOS = `## Terms of Service
1. All orders are subject to approval by staff.
2. Orders are only completed if there is available staff to complete them.
3. Your order is not an immediate priority, unless specially assigned.
4. The queue is first-come-first-serve, unless a Manager or above has assigned your order to be prioritized.
5. Payment is not after the order is done, you either pay before hand or pay bits during the order process.
6. Remaining funds unpaid will be added to your next order if you have one, or you will be banned from ordering if you do not pay your remaining balance.
7. Non-paid service will lead to a ban from ordering, and your order will be closed. Only giveaways are exempt.
8. Refunds aren't guaranteed and may be paid back in store credit if Roblox doesn't allow us.
9. Prices are subject to designer, discounts are not guaranteed with each designer.
10. Your account may be subject to background checks of history within the server.

Ordering means you agree to our ToS, violation can lead to your orders being denied and closed.`;

const FIELDS = {
  budget: { label: "Your Budget", button: 'Budget', style: TextInputStyle.Short },
  description: { label: 'Order Description', button: 'Description', style: TextInputStyle.Paragraph },
  quantity: { label: 'Quantity', button: 'Quantity', style: TextInputStyle.Short },
  deadline: { label: 'Deadline', button: 'Deadline', style: TextInputStyle.Short },
};
const TEXT_ORDER = ['budget', 'description', 'quantity', 'deadline'];
const BUTTON_ORDER = ['budget', 'description', 'deadline', 'quantity'];
// ======================

// ---------- small helpers ----------
const text = (t) => new TextDisplayBuilder().setContent(t);
const gallery = (url) =>
  new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(url));
const btn = (id, label, style = ButtonStyle.Secondary, disabled = false) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;

// ---------- containers ----------
function buildPanel(roleId, categoryId) {
  return new ContainerBuilder()
    .addMediaGalleryComponents(gallery(BANNER_URL))
    .addTextDisplayComponents(text('## Orders\nClick **Order** to start a new order.'))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        btn(`order_open|${roleId}|${categoryId}`, 'Order', ButtonStyle.Success),
        btn('order_info', 'Order Info'),
        btn('order_queue', 'Queue')
      )
    );
}

function welcomeContainer(rec) {
  const claimed = rec.claimedBy ? `\n\n**Claimed by:** <@${rec.claimedBy}>` : '';

  return new ContainerBuilder()
    .addMediaGalleryComponents(gallery(BANNER_URL))
    .addTextDisplayComponents(text(`## Welcome\nWelcome to your order.${claimed}\n\n||<@&1479503457441284289>||`))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        btn('order_claim', rec.claimedBy ? 'Claimed' : 'Claim', ButtonStyle.Success, !!rec.claimedBy),
        btn('order_close', 'Close')
      )
    .addMediaGalleryComponents(gallery(FOOTER_URL))
    );
}

function screeningContainer(rec) {
  const lines = TEXT_ORDER.map((k) => `**${FIELDS[k].label}:** ${rec[k] ?? ''}`).join('\n');

  return new ContainerBuilder()
    .addMediaGalleryComponents(gallery(BANNER_URL))
    .addTextDisplayComponents(
      text(`## Order Information\n<@${rec.ownerId}> - please fill out the details below.\n\n${lines}`)
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        ...BUTTON_ORDER.map((k) => btn(`order_field|${k}`, FIELDS[k].button))
      )
    .addMediaGalleryComponents(gallery(FOOTER_URL))
    );
}

// ---------- order helpers ----------
function openOrders(guild) {
  return Object.entries(store.all())
    .filter(([id]) => guild.channels.cache.has(id)) // ignore deleted channels
    .map(([id, rec]) => ({ id, ...rec }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

const isStaff = (interaction, rec) =>
  interaction.member.roles.cache.has(rec.staffRoleId) ||
  interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);

// ---------- main handler ----------
async function handleOrderInteraction(interaction) {
  const [action, a, b] = interaction.customId.split('|');
  const say = (content) => interaction.reply({ content, flags: EPHEMERAL });

  // ===== ORDER button -> create the order channel straight away =====
  if (action === 'order_open') {
    const existing = openOrders(interaction.guild).find((o) => o.ownerId === interaction.user.id);
    if (existing) return say(`You already have an open order: <#${existing.id}>`);

    await interaction.deferReply({ flags: EPHEMERAL });

    const roleId = a;
    const categoryId = b;

    const perms = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
    ];

    const channel = await interaction.guild.channels.create({
      name: `order-${interaction.user.username}`,
      type: ChannelType.GuildText,
      parent: categoryId !== 'none' ? categoryId : null,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: perms },
        { id: roleId, allow: perms },
        { id: interaction.client.user.id, allow: [...perms, PermissionFlagsBits.ManageChannels] },
      ],
    });

    const rec = {
      ownerId: interaction.user.id,
      staffRoleId: roleId,
      createdAt: Date.now(),
      claimedBy: null,
    };
    store.set(channel.id, rec);

    await channel.send({ components: [welcomeContainer(rec)], flags: V2 });
    await channel.send({ components: [screeningContainer(rec)], flags: V2 });

    return interaction.editReply({ content: `Your order has been created: ${channel}` });
  }

// ===== ORDER INFO -> rules and TOS =====
if (action === 'order_info') {
  const container = new ContainerBuilder()
    .addMediaGalleryComponents(
      gallery('https://cdn.phototourl.com/member/2026-11-14-850594ef-744f-42af-b888-89ce18320c8f.png')
    )
    .addTextDisplayComponents(text(RULES_TOS))
    .addMediaGalleryComponents(gallery(FOOTER_URL));
  return interaction.reply({
    components: [container],
    flags: EPHEMERAL | V2,
  });
}

  // ===== QUEUE -> how many orders are open =====
  if (action === 'order_queue') {
    const count = openOrders(interaction.guild).length;
    return say(
      count === 0
        ? 'There are no open orders right now.'
        : `There ${count === 1 ? 'is' : 'are'} currently **${count}** open order${count === 1 ? '' : 's'}.`
    );
  }

  // ===== everything below happens inside an order channel =====
  const rec = store.get(interaction.channel.id);
  if (!rec) return say("This isn't an active order channel.");

  // ===== CLAIM =====
  if (action === 'order_claim') {
    if (!isStaff(interaction, rec)) return say('Only staff can claim orders.');
    if (rec.claimedBy) return say('This order is already claimed.');

    store.update(interaction.channel.id, { claimedBy: interaction.user.id });
    return interaction.update({
      components: [welcomeContainer(store.get(interaction.channel.id))],
      flags: V2,
    });
  }

  // ===== CLOSE =====
  if (action === 'order_close') {
    if (interaction.user.id !== rec.ownerId && !isStaff(interaction, rec)) {
      return say("You can't close this order.");
    }
    await interaction.reply('Closing in 5 seconds...');
    setTimeout(() => {
      store.remove(interaction.channel.id);
      interaction.channel.delete().catch(console.error);
    }, 5000);
    return;
  }

  // ===== Budget / Description / Deadline / Quantity buttons -> open modal =====
  if (action === 'order_field') {
    if (interaction.user.id !== rec.ownerId && !isStaff(interaction, rec)) {
      return say("You can't edit this order.");
    }
    const field = FIELDS[a];
    const input = new TextInputBuilder()
      .setCustomId('value')
      .setLabel(field.label)
      .setStyle(field.style)
      .setRequired(true)
      .setMaxLength(field.style === TextInputStyle.Paragraph ? 1000 : 100);
    if (rec[a]) input.setValue(rec[a]);

    const modal = new ModalBuilder()
      .setCustomId(`order_modal|${a}`)
      .setTitle(field.label)
      .addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  // ===== field modal submitted -> save + refresh the screening container =====
  if (action === 'order_modal') {
    store.update(interaction.channel.id, { [a]: interaction.fields.getTextInputValue('value') });
    return interaction.update({
      components: [screeningContainer(store.get(interaction.channel.id))],
      flags: V2,
    });
  }
}

module.exports = { handleOrderInteraction, buildPanel };