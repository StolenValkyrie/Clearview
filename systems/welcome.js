const {
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
} = require('discord.js');

// ===== EDIT THESE =====
const WELCOME_CHANNEL_ID = '1473791889554673708';
const FOOTER_URL = 'https://cdn.phototourl.com/member/2026-11-15-92b4d11b-7a03-489d-9071-4fde46d0fafe.png';

const LINKS = {
  dashboard: 'https://discord.com/channels/1468375932543701145/1468556674674724945',
  support: 'https://discord.com/channels/1468375932543701145/1468556674674724945',
  order: 'https://discord.com/channels/1468375932543701145/1477374856952676354',
};

const welcomeText = (member, joined) =>
  `Welcome <@${member.id}> (@${member.user.username}) to ${member.guild.name}! You've joined at <t:${joined}:f>.`;
// ======================

function buildWelcome(member) {
  const joined = Math.floor((member.joinedTimestamp ?? Date.now()) / 1000);

  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(welcomeText(member, joined)))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('welcome_count')
          .setLabel(String(member.guild.memberCount))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder().setLabel('Dashboard').setStyle(ButtonStyle.Link).setURL(LINKS.dashboard),
        new ButtonBuilder().setLabel('Support').setStyle(ButtonStyle.Link).setURL(LINKS.support),
        new ButtonBuilder().setLabel('Order').setStyle(ButtonStyle.Link).setURL(LINKS.order)
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(FOOTER_URL))
    );
}

async function sendWelcome(member) {
  const channel = await member.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);

  if (!channel || !channel.isTextBased()) {
    console.error('[Welcome] Welcome channel not found. Check WELCOME_CHANNEL_ID.');
    return false;
  }

  await channel.send({
    components: [buildWelcome(member)],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { users: [member.id] },
  });

  return true;
}

async function handleMemberJoin(member) {
  if (member.user.bot) return;
  await sendWelcome(member);
}

module.exports = { buildWelcome, sendWelcome, handleMemberJoin };