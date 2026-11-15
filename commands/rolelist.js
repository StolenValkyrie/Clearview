const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { loadMembers, buildRoleList } = require('../systems/rolelist');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rolelist')
    .setDescription('Shows every role in the server with details')
    .setDMPermission(false),

  async execute(interaction) {
    await interaction.deferReply();

    const hasCounts = await loadMembers(interaction.guild);

    return interaction.editReply({
      components: [buildRoleList(interaction.guild, 0, interaction.user.id, hasCounts)],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};