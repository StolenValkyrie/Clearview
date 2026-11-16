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

const FOOTER_URL = 'https://cdn.phototourl.com/member/2026-11-15-92b4d11b-7a03-489d-9071-4fde46d0fafe.png';
const PER_PAGE = 8;

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;

// Member counts per role need the member list (Server Members Intent)
async function loadMembers(guild) {
  if (guild.members.cache.size >= guild.memberCount) return true;
  try {
    await guild.members.fetch();
    return true;
  } catch (error) {
    console.error('[RoleList] Could not fetch members:', error);
    return false;
  }
}

function roleLine(role, rank, hasCounts) {
  const parts = [];

  if (hasCounts) parts.push(`${role.members.size} member${role.members.size === 1 ? '' : 's'}`);
  parts.push(role.color === 0 ? 'No colour' : role.hexColor);
  if (role.hoist) parts.push('Hoisted');
  if (role.mentionable) parts.push('Mentionable');
  if (role.managed) parts.push('Bot role');

  return `**${rank}.** ${role} - ${parts.join(' • ')}`;
}

function buildRoleList(guild, page, userId, hasCounts) {
  const roles = [...guild.roles.cache.values()]
    .filter((role) => role.id !== guild.id)
    .sort((a, b) => b.position - a.position);

  const pages = Math.max(1, Math.ceil(roles.length / PER_PAGE));
  const current = Math.min(Math.max(page, 0), pages - 1);
  const start = current * PER_PAGE;

  const lines = roles
    .slice(start, start + PER_PAGE)
    .map((role, i) => roleLine(role, start + i + 1, hasCounts));

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# ${guild.name} Roles\n**Total Roles:** ${roles.length}\n\n${lines.join('\n') || 'No roles.'}`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(FOOTER_URL))
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`rolelist|${current - 1}|${userId}`)
          .setLabel('Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(current === 0),
        new ButtonBuilder()
          .setCustomId('rolelist|page|0')
          .setLabel(`Page ${current + 1}/${pages}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`rolelist|${current + 1}|${userId}`)
          .setLabel('Next')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(current >= pages - 1)
      )
    );
}

async function handleRoleListInteraction(interaction) {
  const [, page, ownerId] = interaction.customId.split('|');

  if (interaction.user.id !== ownerId) {
    return interaction.reply({
      content: 'Only the person who ran this command can change pages.',
      flags: EPHEMERAL,
    });
  }

  await interaction.deferUpdate();
  const hasCounts = await loadMembers(interaction.guild);

  return interaction.editReply({
    components: [buildRoleList(interaction.guild, Number(page), ownerId, hasCounts)],
  });
}

module.exports = { loadMembers, buildRoleList, handleRoleListInteraction };