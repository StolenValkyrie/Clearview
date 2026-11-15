const {
  SlashCommandBuilder,
  ChannelType,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SectionBuilder,
  ThumbnailBuilder,
} = require('discord.js');

const FOOTER_URL = 'https://cdn.phototourl.com/member/2026-11-15-92b4d11b-7a03-489d-9071-4fde46d0fafe.png';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Shows information about this server')
    .setDMPermission(false),

  async execute(interaction) {
    const guild = interaction.guild;

    const channels = guild.channels.cache.filter((channel) => !channel.isThread());
    const countOf = (...types) => channels.filter((channel) => types.includes(channel.type)).size;

    const textChannels = countOf(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum);
    const voiceChannels = countOf(ChannelType.GuildVoice, ChannelType.GuildStageVoice);
    const categories = countOf(ChannelType.GuildCategory);

    const created = Math.floor(guild.createdTimestamp / 1000);
    const boosts = guild.premiumSubscriptionCount ?? 0;

    const info = new TextDisplayBuilder().setContent(
      `# ${guild.name}\n` +
        `**Boosts:** ${boosts.toLocaleString()} (Level ${guild.premiumTier})\n` +
        `**Roles:** ${(guild.roles.cache.size - 1).toLocaleString()}\n` +
        `**Channels:** ${channels.size.toLocaleString()} (${textChannels} text, ${voiceChannels} voice, ${categories} categories)\n` +
        `**Server Age:** <t:${created}:D> (<t:${created}:R>)\n` +
        `**Members:** ${guild.memberCount.toLocaleString()}`
    );

    const container = new ContainerBuilder();

    const icon = guild.iconURL({ size: 256 });
    if (icon) {
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(info)
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(icon))
      );
    } else {
      container.addTextDisplayComponents(info);
    }

    container
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      )
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(FOOTER_URL))
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# Requested by ${interaction.user}`)
      );

    return container;
  },
};