const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { createPoll, parseDuration } = require('../systems/polls');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Creates a poll people can vote on')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((o) =>
      o.setName('question').setDescription('The question to ask').setRequired(true).setMaxLength(200)
    )
    .addStringOption((o) =>
      o.setName('option1').setDescription('First option').setRequired(true).setMaxLength(80)
    )
    .addStringOption((o) =>
      o.setName('option2').setDescription('Second option').setRequired(true).setMaxLength(80)
    )
    .addStringOption((o) => o.setName('option3').setDescription('Third option').setMaxLength(80))
    .addStringOption((o) => o.setName('option4').setDescription('Fourth option').setMaxLength(80))
    .addStringOption((o) => o.setName('option5').setDescription('Fifth option').setMaxLength(80))
    .addStringOption((o) =>
      o.setName('duration').setDescription('When it closes, e.g. 30m, 2h, 1d (leave empty to keep it open)')
    ),

  async execute(interaction) {
    const question = interaction.options.getString('question');

    const options = [1, 2, 3, 4, 5]
      .map((n) => interaction.options.getString(`option${n}`))
      .filter(Boolean)
      .map((o) => o.trim());

    // no duplicate options
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
      return interaction.reply({
        content: 'Each option has to be different.',
        flags: MessageFlags.Ephemeral,
      });
    }

    // optional closing time
    let durationMs = null;
    const durationInput = interaction.options.getString('duration');
    if (durationInput) {
      durationMs = parseDuration(durationInput);
      if (!durationMs) {
        return interaction.reply({
          content: 'Invalid duration. Use a number and a unit like `30m`, `2h`, `1d` or `1w` (10 seconds to 30 days).',
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Posts the poll as a normal message in the channel (not a reply)
    const message = await createPoll(interaction.channel, {
      question,
      options,
      hostId: interaction.user.id,
      durationMs,
    });

    return interaction.editReply(`Poll created: ${message.url}`);
  },
};