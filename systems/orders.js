
const store = require('../store');

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

// ===== EDIT THESE =====
const BANNER_URL =
  'https://cdn.phototourl.com/member/2026-11-14-45974b59-6584-47bd-b466-cd5f197fa967.png';

const FOOTER_URL =
  'https://cdn.phototourl.com/member/2026-11-15-92b4d11b-7a03-489d-9071-4fde46d0fafe.png';

const INFO_BANNER_URL =
  'https://cdn.phototourl.com/member/2026-11-14-850594ef-744f-42af-b888-89ce18320c8f.png';

const STAFF_PING_ROLE_ID = '1479503457441284289';

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
  budget: {
    label: 'Your Budget',
    button: 'Budget',
    style: TextInputStyle.Short,
  },
  description: {
    label: 'Order Description',
    button: 'Description',
    style: TextInputStyle.Paragraph,
  },
  quantity: {
    label: 'Quantity',
    button: 'Quantity',
    style: TextInputStyle.Short,
  },
  deadline: {
    label: 'Deadline',
    button: 'Deadline',
    style: TextInputStyle.Short,
  },
};

const TEXT_ORDER = ['budget', 'description', 'quantity', 'deadline'];
const BUTTON_ORDER = ['budget', 'description', 'deadline', 'quantity'];

// ======================

// ---------- small helpers ----------

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;

const text = (content) =>
  new TextDisplayBuilder().setContent(content);

const gallery = (url) =>
  new MediaGalleryBuilder().addItems(
    new MediaGalleryItemBuilder().setURL(url)
  );

const btn = (
  id,
  label,
  style = ButtonStyle.Secondary,
  disabled = false
) =>
  new ButtonBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setDisabled(disabled);

// ---------- containers ----------

// Main order panel
function buildPanel(roleId, categoryId) {
  return new ContainerBuilder()
    .addMediaGalleryComponents(gallery(BANNER_URL))
    .addTextDisplayComponents(
      text('## Orders\nClick **Order** to start a new order.')
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        btn(
          `order_open|${roleId}|${categoryId}`,
          'Order',
          ButtonStyle.Success
        ),
        btn('order_info', 'Order Info'),
        btn('order_queue', 'Queue')
      )
    )
    .addMediaGalleryComponents(gallery(FOOTER_URL));
}

// Welcome message inside the order channel
function welcomeContainer(rec) {
  const claimed = rec.claimedBy
    ? `\n\n**Claimed by:** <@${rec.claimedBy}>`
    : '';

  return new ContainerBuilder()
    .addMediaGalleryComponents(gallery(BANNER_URL))
    .addTextDisplayComponents(
      text(
        `## Welcome
Welcome to your order.${claimed}

||<@&${STAFF_PING_ROLE_ID}>||`
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        btn(
          'order_claim',
          rec.claimedBy ? 'Claimed' : 'Claim',
          ButtonStyle.Success,
          !!rec.claimedBy
        ),
        btn('order_close', 'Close', ButtonStyle.Danger)
      )
    )
    .addMediaGalleryComponents(gallery(FOOTER_URL));
}

// Order information / screening message
function screeningContainer(rec) {
  const lines = TEXT_ORDER
    .map((key) => `**${FIELDS[key].label}:** ${rec[key] ?? 'Not provided'}`)
    .join('\n');

  return new ContainerBuilder()
    .addMediaGalleryComponents(gallery(BANNER_URL))
    .addTextDisplayComponents(
      text(
        `## Order Information
<@${rec.ownerId}> - please fill out the details below.

${lines}`
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        ...BUTTON_ORDER.map((key) =>
          btn(`order_field|${key}`, FIELDS[key].button)
        )
      )
    )
    .addMediaGalleryComponents(gallery(FOOTER_URL));
}

// ---------- order helpers ----------

function openOrders(guild) {
  return Object.entries(store.all())
    .filter(([id]) => guild.channels.cache.has(id))
    .map(([id, rec]) => ({ id, ...rec }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

function isStaff(interaction, rec) {
  return (
    interaction.member.roles.cache.has(rec.staffRoleId) ||
    interaction.member.permissions.has(
      PermissionFlagsBits.ManageChannels
    )
  );
}

// ---------- main handler ----------

async function handleOrderInteraction(interaction) {
  if (!interaction.isButton() && !interaction.isModalSubmit()) {
    return;
  }

  const [action, a, b] = interaction.customId.split('|');

  const say = (content) =>
    interaction.reply({
      content,
      flags: EPHEMERAL,
    });

  // ===== ORDER BUTTON =====

  if (action === 'order_open' && interaction.isButton()) {
    const existing = openOrders(interaction.guild).find(
      (order) => order.ownerId === interaction.user.id
    );

    if (existing) {
      return say(
        `You already have an open order: <#${existing.id}>`
      );
    }

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
        {
          id: interaction.guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: perms,
        },
        {
          id: roleId,
          allow: perms,
        },
        {
          id: interaction.client.user.id,
          allow: [
            ...perms,
            PermissionFlagsBits.ManageChannels,
          ],
        },
      ],
    });

    const rec = {
      ownerId: interaction.user.id,
      staffRoleId: roleId,
      createdAt: Date.now(),
      claimedBy: null,
      budget: '',
      description: '',
      quantity: '',
      deadline: '',
    };

    store.set(channel.id, rec);

    await channel.send({
      components: [welcomeContainer(rec)],
      flags: V2,
    });

    await channel.send({
      components: [screeningContainer(rec)],
      flags: V2,
    });

    return interaction.editReply({
      content: `Your order has been created: ${channel}`,
    });
  }

  // ===== ORDER INFO =====

  if (action === 'order_info' && interaction.isButton()) {
    const container = new ContainerBuilder()
      .addMediaGalleryComponents(gallery(INFO_BANNER_URL))
      .addTextDisplayComponents(text(RULES_TOS))
      .addMediaGalleryComponents(gallery(FOOTER_URL));

    return interaction.reply({
      components: [container],
      flags: EPHEMERAL | V2,
    });
  }

  // ===== QUEUE =====

  if (action === 'order_queue' && interaction.isButton()) {
    const count = openOrders(interaction.guild).length;

    return say(
      count === 0
        ? 'There are no open orders right now.'
        : `There ${count === 1 ? 'is' : 'are'} currently **${count}** open order${count === 1 ? '' : 's'}.`
    );
  }

  // ===== EVERYTHING BELOW HAPPENS INSIDE AN ORDER CHANNEL =====

  const rec = store.get(interaction.channel?.id);

  if (!rec) {
    return say("This isn't an active order channel.");
  }

  // ===== CLAIM ORDER =====

  if (action === 'order_claim' && interaction.isButton()) {
    if (!isStaff(interaction, rec)) {
      return say('Only staff can claim orders.');
    }

    if (rec.claimedBy) {
      return say('This order is already claimed.');
    }

    store.update(interaction.channel.id, {
      claimedBy: interaction.user.id,
    });

    const updatedRec = store.get(interaction.channel.id);

    return interaction.update({
      components: [welcomeContainer(updatedRec)],
    });
  }

  // ===== CLOSE ORDER =====

  if (action === 'order_close' && interaction.isButton()) {
    if (
      interaction.user.id !== rec.ownerId &&
      !isStaff(interaction, rec)
    ) {
      return say("You can't close this order.");
    }

    await interaction.reply({
      content: 'Closing in 5 seconds...',
      flags: EPHEMERAL,
    });

    setTimeout(() => {
      store.remove(interaction.channel.id);
      interaction.channel.delete().catch(console.error);
    }, 5000);

    return;
  }

  // ===== FIELD BUTTONS -> OPEN MODAL =====

  if (action === 'order_field' && interaction.isButton()) {
    if (
      interaction.user.id !== rec.ownerId &&
      !isStaff(interaction, rec)
    ) {
      return say("You can't edit this order.");
    }

    const field = FIELDS[a];

    if (!field) {
      return say('That order field does not exist.');
    }

    const input = new TextInputBuilder()
      .setCustomId('value')
      .setLabel(field.label)
      .setStyle(field.style)
      .setRequired(true)
      .setMaxLength(
        field.style === TextInputStyle.Paragraph ? 1000 : 100
      );

    if (rec[a]) {
      input.setValue(rec[a]);
    }

    const modal = new ModalBuilder()
      .setCustomId(`order_modal|${a}`)
      .setTitle(field.label)
      .addComponents(
        new ActionRowBuilder().addComponents(input)
      );

    return interaction.showModal(modal);
  }

  // ===== MODAL SUBMITTED -> SAVE AND REFRESH =====

  if (action === 'order_modal' && interaction.isModalSubmit()) {
    const field = FIELDS[a];

    if (!field) {
      return say('That order field does not exist.');
    }

    if (
      interaction.user.id !== rec.ownerId &&
      !isStaff(interaction, rec)
    ) {
      return say("You can't edit this order.");
    }

    const value = interaction.fields.getTextInputValue('value');

    store.update(interaction.channel.id, {
      [a]: value,
    });

    const updatedRec = store.get(interaction.channel.id);

    return interaction.update({
      components: [screeningContainer(updatedRec)],
    });
  }
}

module.exports = {
  handleOrderInteraction,
  buildPanel,
};
