const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { buildPanel } = require('../orders');

// IDs MUST be in quotes (strings), never plain numbers
const STAFF_ROLE_ID = '1479503457441284289';
const CATEGORY_ID = '1571084647012499617';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('orderpanel')
    .setDescription('Sends the order panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    // Send the panel as a normal message in the channel (not a reply)
    await interaction.channel.send({
      components: [buildPanel(STAFF_ROLE_ID, CATEGORY_ID)],
      flags: MessageFlags.IsComponentsV2,
    });

    // Discord needs a response to the command, so only the user sees this
    return interaction.reply({
      content: 'Order panel sent.',
      flags: MessageFlags.Ephemeral,
    });
  },
};