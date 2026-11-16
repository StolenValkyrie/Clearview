const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { buildDashboard } = require('../systems/dashboard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dashboard')
    .setDescription('Sends the server dashboard')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    // Posts the dashboard as a normal message in the channel (not a reply)
    await interaction.channel.send({
      components: [buildDashboard()],
      flags: MessageFlags.IsComponentsV2,
    });

    return interaction.reply({
      content: 'Dashboard sent.',
      flags: MessageFlags.Ephemeral,
    });
  },
};