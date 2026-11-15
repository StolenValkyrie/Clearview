const {
  SlashCommandBuilder,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
} = require('discord.js');

const FOOTER_URL = 'https://cdn.phototourl.com/member/2026-11-15-92b4d11b-7a03-489d-9071-4fde46d0fafe.png';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('membercount')
    .setDescription('Shows how many members and bots are in the server')
    .setDMPermission(false),

  async execute(interaction) {
    await interaction.deferReply();

    const guild = interaction.guild;

    try {
      if (guild.members.cache.size < guild.memberCount) {
        await guild.members.fetch();
      }
    } catch (error) {
      console.error('[MemberCount] Could not fetch members:', error);
      return interaction.editReply(
        "I can't read the member list. Turn on **Server Members Intent** for the bot in the Discord Developer Portal."
      );
    }

    const total = guild.memberCount;
    const bots = guild.members.cache.filter((member) => member.user.bot).size;
    const members = total - bots;

    const container = new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 👥 ${guild.name} Member Count\n` +
            `**Total Members:** ${total.toLocaleString()}\n` +
            `**Server Members:** ${members.toLocaleString()}\n` +
            `**Bots:** ${bots.toLocaleString()}`
        )
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      )
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(FOOTER_URL))
      );

    return interaction.editReply({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};