const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
} = require('discord.js');
const { ALLOWED_ROLES, registerPortfolio } = require('../systems/portfolios');

// ===== EDIT THESE =====
const FORUM_CHANNEL_ID = '1477097618000580700';
const BANNER_URL = 'https://cdn.phototourl.com/member/2026-11-14-cde5edc7-2e3b-4aef-a6b0-8233f9ea546f.png';
const FOOTER_URL = 'https://cdn.phototourl.com/member/2026-11-15-92b4d11b-7a03-489d-9071-4fde46d0fafe.png';
// ======================

const gallery = (url) =>
  new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(url));
const separator = () =>
  new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('designer-portfolio-create')
    .setDescription('Creates a portfolio post for a designer')
    .addUserOption((o) =>
      o.setName('designer').setDescription('The designer this portfolio is for').setRequired(true)
    ),

  async execute(interaction) {
    // Admins and the allowed roles can run this command
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    const hasRole = ALLOWED_ROLES.some((id) => interaction.member.roles.cache.has(id));

    if (!isAdmin && !hasRole) {
      return interaction.reply({
        content: "You don't have permission to use this command.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const designer = interaction.options.getUser('designer');
    const forum = await interaction.client.channels.fetch(FORUM_CHANNEL_ID).catch(() => null);

    if (!forum || !forum.threads) {
      return interaction.editReply('I can\'t find the forum channel. Check `FORUM_CHANNEL_ID` in the command file.');
    }

    const container = new ContainerBuilder()
      .addMediaGalleryComponents(gallery(BANNER_URL))
      .addSeparatorComponents(separator())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# <:clearvieworgn:1508115691897880748> Designer Portfolios\nDesigner: ${designer}`
        )
      )
      .addSeparatorComponents(separator())
      .addMediaGalleryComponents(gallery(FOOTER_URL));

    const thread = await forum.threads.create({
      name: `${designer.username} - Portfolio`.slice(0, 100),
      message: {
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      },
    });

    // Let the designer type in the forum (the bot keeps them to their own post)
    await forum.permissionOverwrites
      .edit(designer.id, { SendMessagesInThreads: true })
      .catch(console.error);

    registerPortfolio(thread.id, designer.id);

    return interaction.editReply(`Portfolio created: ${thread}`);
  },
};