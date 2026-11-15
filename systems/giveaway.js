const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { createGiveaway, parseDuration } = require('../systems/giveaways');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Starts a giveaway in this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) =>
      o.setName('prize').setDescription('What is being given away').setRequired(true).setMaxLength(100)
    )
    .addStringOption((o) =>
      o.setName('duration').setDescription('How long it runs, e.g. 30m, 2h, 1d, 1w').setRequired(true)
    )
    .addIntegerOption((o) =>
      o.setName('winners').setDescription('Number of winners (default 1)').setMinValue(1).setMaxValue(20)
    ),

  async execute(interaction) {
    const prize = interaction.options.getString('prize');
    const winners = interaction.options.getInteger('winners') ?? 1;
    const durationMs = parseDuration(interaction.options.getString('duration'));

    if (!durationMs) {
      return interaction.reply({
        content: 'Invalid duration. Use a number and a unit like `30m`, `2h`, `1d` or `1w` (10 seconds to 30 days).',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Posts the giveaway as a normal message in the channel (not a reply)
    const message = await createGiveaway(interaction.channel, {
      prize,
      hostId: interaction.user.id,
      winners,
      durationMs,
    });

    return interaction.editReply(`Giveaway started: ${message.url}`);
  },
};