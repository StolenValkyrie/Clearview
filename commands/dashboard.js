const {
  ChannelType,
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
} = require('discord.js');

const cases = require('./cases');

// ===== EDIT THESE =====
const BANNER_URL = 'https://cdn.phototourl.com/member/2026-11-16-b08a3b31-ce30-4eeb-a960-2d15a6faf5f3.png';
const FOOTER_URL = 'https://cdn.phototourl.com/member/2026-11-15-92b4d11b-7a03-489d-9071-4fde46d0fafe.png';
const SUPPORT_ROLE_ID = '1479500802983727248';
const SUPPORT_CATEGORY_ID = '1473791839738921158';

// Applications open in their own private channel. These default to the support
// role and category, so swap in different IDs if applications should go elsewhere.
const APPLICATION_ROLE_ID = SUPPORT_ROLE_ID;
const APPLICATION_CATEGORY_ID = SUPPORT_CATEGORY_ID;

const TEXT = {
  dashboard:
    '# Dashboard\n' +
    'Need help? Press **Support** to open a ticket, press **Application** to apply for a position, or pick a topic from the menu below.',

  info:
    '## Information\n' +
    'Welcome to Clearview Customs! We are an aspriring community of creators who aim to provide the best experience for you and everyone else!\nOrginally .stacked, ownership has changed and we are now officially Clearview customs.\n\n We appreciate you joining.',

  rules:
    '## Rules\n' +
    '1. Be respectful to everyone.\n' +
    '2. No spamming.\n' +
    '3. Discord ToS is enforced.\n' +
    '4. No NSFW content. This includes profile pictures, banners, and usernames.\n' +
    '5. Keep all discussions in the appropriate channels.\n' +
    '6. No advertising other servers.\n' +
    '7. No impersonation of staff or other members.\n' +
    '8. No malicious links or files.\n' +
    '9. No hate speech or discrimination.\n',

  supportWelcome: (user, openedAt) =>
    `# Support\nHey ${user}, staff will be with you shortly. Please tell us the reason for your ticket, and relevnt information.\nYou've opened this ticket at <t:${openedAt}:F>.`,

  applicationWelcome: (user, openedAt) =>
    `# Application\nHey ${user}, thanks for applying! Please answer the questions below and staff will review your application.\nYou've opened this application at <t:${openedAt}:F>.\n\n` +
    '1. Which position are you applying for?\n' +
    '2. Why do you want this position?\n' +
    '3. Do you have any relevant experience?\n' +
    '4. What is your timezone and how active can you be?',
};
// ======================

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;

const text = (t) => new TextDisplayBuilder().setContent(t);
const divider = () =>
  new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
const banner = () =>
  new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(BANNER_URL));
const footer = () =>
  new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(FOOTER_URL));

// ---------- the dashboard ----------
function buildDashboard() {
  return new ContainerBuilder()
    .addMediaGalleryComponents(banner())
    .addTextDisplayComponents(text(TEXT.dashboard))
    .addSeparatorComponents(divider())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('dash_support')
          .setLabel('Support')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('dash_apply')
          .setLabel('Application')
          .setStyle(ButtonStyle.Primary)
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('dash_menu')
          .setPlaceholder('Select a topic')
          .addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel('Info')
              .setDescription('Learn about the server')
              .setValue('info'),
            new StringSelectMenuOptionBuilder()
              .setLabel('Rules')
              .setDescription('Read the server rules')
              .setValue('rules')
          )
      )
    )
    .addMediaGalleryComponents(footer());
}

// the private message shown when someone picks Info or Rules
function topicContainer(content) {
  return new ContainerBuilder()
    .addTextDisplayComponents(text(content))
    .addSeparatorComponents(divider())
    .addMediaGalleryComponents(footer());
}

// What differs between a support ticket and an application
const CASE_TYPES = {
  ticket: {
    welcome: (rec) => TEXT.supportWelcome(`<@${rec.openerId}>`, rec.openedAt),
    roleId: SUPPORT_ROLE_ID,
    categoryId: SUPPORT_CATEGORY_ID,
    channelPrefix: 'support',
    noun: 'ticket',
  },
  application: {
    welcome: (rec) => TEXT.applicationWelcome(`<@${rec.openerId}>`, rec.openedAt),
    roleId: APPLICATION_ROLE_ID,
    categoryId: APPLICATION_CATEGORY_ID,
    channelPrefix: 'application',
    noun: 'application',
  },
};

// Welcome message inside a ticket or application. The case system redraws it on claim / unclaim.
function caseWelcome(rec) {
  const type = CASE_TYPES[rec.kind];
  const claimed = rec.claimedBy ? `\n\n**Claimed by:** <@${rec.claimedBy}>` : '';

  return new ContainerBuilder()
    .addTextDisplayComponents(
      text(`${type.welcome(rec)}\n\n**ID:** ${rec.id}${claimed}\n\n||<@&${type.roleId}>||`)
    )
    .addSeparatorComponents(divider())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('case_claim')
          .setLabel(rec.claimedBy ? 'Claimed' : 'Claim')
          .setStyle(ButtonStyle.Success)
          .setDisabled(!!rec.claimedBy),
        new ButtonBuilder()
          .setCustomId('case_unclaim')
          .setLabel('Unclaim')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(!rec.claimedBy),
        new ButtonBuilder()
          .setCustomId('case_close')
          .setLabel('Close')
          .setStyle(ButtonStyle.Danger)
      )
    )
    .addMediaGalleryComponents(footer());
}

cases.registerRenderer('ticket', caseWelcome);
cases.registerRenderer('application', caseWelcome);

// ---------- interaction handler ----------
async function handleDashboardInteraction(interaction) {
  // ===== Info / Rules dropdown =====
  if (interaction.isStringSelectMenu() && interaction.customId === 'dash_menu') {
    const content = interaction.values[0] === 'rules' ? TEXT.rules : TEXT.info;

    await interaction.reply({
      components: [topicContainer(content)],
      flags: EPHEMERAL | V2,
    });

    // reset the dropdown so the same option can be picked again
    await interaction.message
      .edit({ components: [buildDashboard()], flags: V2 })
      .catch(() => {});
    return;
  }

  // ===== Support / Application button -> private channel =====
  const kind =
    interaction.customId === 'dash_support'
      ? 'ticket'
      : interaction.customId === 'dash_apply'
        ? 'application'
        : null;

  if (interaction.isButton() && kind) {
    const type = CASE_TYPES[kind];
    const existing = cases.findOpenByOpener(kind, interaction.user.id, interaction.guild);

    if (existing) {
      return interaction.reply({
        content: `You already have an open ${type.noun}: <#${existing.channelId}>`,
        flags: EPHEMERAL,
      });
    }

    await interaction.deferReply({ flags: EPHEMERAL });

    const perms = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
    ];

    const channel = await interaction.guild.channels.create({
      name: `${type.channelPrefix}-${interaction.user.username}`,
      type: ChannelType.GuildText,
      parent: type.categoryId,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: perms },
        { id: type.roleId, allow: perms },
        { id: interaction.client.user.id, allow: [...perms, PermissionFlagsBits.ManageChannels] },
      ],
    });

    // creates the SUP-xxxxx / APP-xxxxx record and logs that it was opened
    const rec = await cases.openCase(interaction.client, {
      kind,
      channel,
      opener: interaction.user,
      staffRoleId: type.roleId,
    });

    const welcome = await channel.send({ components: [caseWelcome(rec)], flags: V2 });
    cases.updateCase(rec.id, { welcomeMessageId: welcome.id });

    return interaction.editReply({ content: `Your ${type.noun} has been created: ${channel}` });
  }
}

module.exports = { buildDashboard, handleDashboardInteraction };