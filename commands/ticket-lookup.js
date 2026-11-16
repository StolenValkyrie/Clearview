const { SlashCommandBuilder, MessageFlags } = require('discord.js');

const { getById, canLookup, buildLookup } = require('../systems/cases');

const V2 = MessageFlags.IsComponentsV2;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-lookup')
    .setDescription('Look up a ticket or order by its ID')
    .addStringOption((o) =>
      o.setName('id').setDescription('e.g. SUP-12345 or ORD-12345').setRequired(true)
    ),

  async execute(interaction) {
    if (!canLookup(interaction.member)) {
      return interaction.reply({
        content: 'You do not have permission to use this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const id = interaction.options.getString('id').trim();
    const record = getById(id);

    if (!record) {
      return interaction.reply({
        content: `No ticket or order was found with ID \`${id}\`.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({
      components: [buildLookup(record)],
      flags: MessageFlags.Ephemeral | V2,
      allowedMentions: { parse: [] },
    });
  },

  async prefix(message, args) {
    if (!message.member || !canLookup(message.member)) {
      return message.reply('You do not have permission to use this command.');
    }

    if (!args[0]) return message.reply('Usage: `^ticket-lookup SUP-12345`');

    const record = getById(args[0]);
    if (!record) return message.reply(`No ticket or order was found with ID \`${args[0]}\`.`);

    return message.reply({
      components: [buildLookup(record)],
      flags: V2,
      allowedMentions: { parse: [], repliedUser: false },
    });
  },
};