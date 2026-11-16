const { SlashCommandBuilder, MessageFlags } = require('discord.js');

// The role list itself (and its page buttons) live in systems/rolelist.js
const { loadMembers, buildRoleList } = require('../systems/rolelist');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rolelist')
    .setDescription('Shows every role in the server with member counts'),

  async execute(interaction) {
    // Loading every member can take a moment, so acknowledge first
    await interaction.deferReply();

    const hasCounts = await loadMembers(interaction.guild);

    return interaction.editReply({
      components: [buildRoleList(interaction.guild, 0, interaction.user.id, hasCounts)],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};