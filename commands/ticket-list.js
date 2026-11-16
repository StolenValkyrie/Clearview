const { SlashCommandBuilder, MessageFlags } = require('discord.js');

const { canLookup, buildList } = require('../systems/cases');

const V2 = MessageFlags.IsComponentsV2;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-list')
    .setDescription('Browse all tickets and orders and open their transcripts')
    .addStringOption((o) =>
      o
        .setName('type')
        .setDescription('Tickets, orders or both')
        .addChoices(
          { name: 'All', value: 'all' },
          { name: 'Support tickets', value: 'ticket' },
          { name: 'Orders', value: 'order' }
        )
    )
    .addStringOption((o) =>
      o
        .setName('status')
        .setDescription('Open, closed or both')
        .addChoices(
          { name: 'All', value: 'all' },
          { name: 'Open', value: 'open' },
          { name: 'Closed', value: 'closed' }
        )
    )
    .addUserOption((o) => o.setName('user').setDescription('Only show ones opened by this member')),

  async execute(interaction) {
    if (!canLookup(interaction.member)) {
      return interaction.reply({
        content: 'You do not have permission to use this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const filters = {
      type: interaction.options.getString('type') ?? 'all',
      status: interaction.options.getString('status') ?? 'all',
      userId: interaction.options.getUser('user')?.id ?? null,
    };

    return interaction.reply({
      components: [buildList(filters, 0, interaction.user.id)],
      flags: MessageFlags.Ephemeral | V2,
      allowedMentions: { parse: [] },
    });
  },

  // ^ticket-list [tickets|orders|all] [open|closed|all]
  async prefix(message, args) {
    if (!message.member || !canLookup(message.member)) {
      return message.reply('You do not have permission to use this command.');
    }

    const words = args.map((a) => a.toLowerCase());
    const type = words.includes('orders') || words.includes('order')
      ? 'order'
      : words.includes('tickets') || words.includes('ticket')
        ? 'ticket'
        : 'all';
    const status = words.includes('open') ? 'open' : words.includes('closed') ? 'closed' : 'all';

    return message.reply({
      components: [buildList({ type, status, userId: message.mentions.users.first()?.id ?? null }, 0, message.author.id)],
      flags: V2,
      allowedMentions: { parse: [], repliedUser: false },
    });
  },
};