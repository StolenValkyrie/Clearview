
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

const {
  createGiveaway,
  parseDuration,
} = require('../systems/giveaway');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Starts a giveaway in this channel')
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addStringOption((option) =>
      option
        .setName('prize')
        .setDescription('What is being given away')
        .setRequired(true)
        .setMaxLength(100)
    )
    .addStringOption((option) =>
      option
        .setName('duration')
        .setDescription('How long it runs, e.g. 30m, 2h, 1d, 1w')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('winners')
        .setDescription('Number of winners (default 1)')
        .setMinValue(1)
        .setMaxValue(20)
    ),

  async execute(interaction) {
    const prize = interaction.options.getString('prize');
    const winners = interaction.options.getInteger('winners') ?? 1;
    const durationInput = interaction.options.getString('duration');

    const durationMs = parseDuration(durationInput);

    if (!durationMs) {
      return interaction.reply({
        content:
          'Invalid duration. Use a number and a unit like `30s`, `30m`, `2h`, `1d` or `1w`. Minimum 10 seconds, maximum 30 days.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!interaction.channel || !interaction.channel.isTextBased()) {
      return interaction.reply({
        content: 'This command can only be used in a text channel.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    try {
      const message = await createGiveaway(
        interaction.channel,
        {
          prize,
          hostId: interaction.user.id,
          winners,
          durationMs,
        }
      );

      return interaction.editReply(
        `Giveaway started successfully!\n${message.url}`
      );

    } catch (error) {
      console.error('[Giveaways] Creation error:', error);

      return interaction.editReply(
        'Something went wrong while creating the giveaway. Check the bot logs.'
      );
    }
  },
};
