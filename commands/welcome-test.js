const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { sendWelcome } = require('../systems/welcome');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('welcome-test')
    .setDescription('Sends a preview of the member join message')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const sent = await sendWelcome(interaction.member);

    return interaction.editReply(
      sent
        ? 'Welcome message sent.'
        : "I couldn't find the welcome channel. Set `WELCOME_CHANNEL_ID` in `systems/welcome.js`."
    );
  },
};