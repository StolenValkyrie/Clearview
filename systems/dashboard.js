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

const TEXT = {
  dashboard:
    '# Dashboard\n' +
    'Need help? Press **Support** to open a ticket, or pick a topic from the menu below.',

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

  supportWelcome: (user) =>
    `# Support\nHey ${user}, staff will be with you shortly. Please tell us the reason for your ticket, and relevnt information.\nYou've opened this ticket at <t:${Math.floor(Date.now() / 1000)}:F>.`,
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
          .setStyle(ButtonStyle.Success)
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

// Welcome message inside a ticket. The case system redraws it on claim / unclaim.
function ticketWelcome(rec) {
  const claimed = rec.claimedBy ? `\n\n**Claimed by:** <@${rec.claimedBy}>` : '';

  return new ContainerBuilder()
    .addTextDisplayComponents(
      text(
        `${TEXT.supportWelcome(`<@${rec.openerId}>`)}\n\n**ID:** ${rec.id}${claimed}\n\n||<@&${SUPPORT_ROLE_ID}>||`
      )
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

cases.registerRenderer('ticket', ticketWelcome);

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

  // ===== Support button -> private ticket channel =====
  if (interaction.isButton() && interaction.customId === 'dash_support') {
    const existing = cases.findOpenByOpener('ticket', interaction.user.id, interaction.guild);

    if (existing) {
      return interaction.reply({
        content: `You already have an open ticket: <#${existing.channelId}>`,
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
      name: `support-${interaction.user.username}`,
      type: ChannelType.GuildText,
      parent: SUPPORT_CATEGORY_ID,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: perms },
        { id: SUPPORT_ROLE_ID, allow: perms },
        { id: interaction.client.user.id, allow: [...perms, PermissionFlagsBits.ManageChannels] },
      ],
    });

    // creates the SUP-xxxxx record and logs that it was opened
    const rec = await cases.openCase(interaction.client, {
      kind: 'ticket',
      channel,
      opener: interaction.user,
      staffRoleId: SUPPORT_ROLE_ID,
    });

    const welcome = await channel.send({ components: [ticketWelcome(rec)], flags: V2 });
    cases.updateCase(rec.id, { welcomeMessageId: welcome.id });

    return interaction.editReply({ content: `Your ticket has been created: ${channel}` });
  }
}

module.exports = { buildDashboard, handleDashboardInteraction };