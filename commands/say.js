const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Say a plain text using the bot.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((o) =>
      o.setName('message').setDescription('Shift+Enter for a new line.').setRequired(true)
    )
    .addChannelOption((o) =>
      o
        .setName('channel')
        .setDescription('Where to send it (default: this channel)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    ),

  async execute(interaction) {
    const message = interaction.options.getString('message').replace(/\\n/g, '\n');
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;

    try {
      await channel.send({
        content: message,
        allowedMentions: { parse: ['users', 'roles'] }, // blocks @everyone / @here
      });
    } catch (err) {
      console.error(err);
      return interaction.reply({
        content: `I can't send messages in ${channel}. Check my permissions there.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({
      content: `Sent in ${channel}.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};