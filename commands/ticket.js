const { MessageFlags, SlashCommandBuilder } = require('discord.js');

const {
  getByChannel,
  canManageCase,
  canClose,
  claimCase,
  unclaimCase,
  closeCase,
  logEvent,
  labelOf,
} = require('../systems/cases');

const ephemeral = (interaction, content) =>
  interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });

const OVERWRITES = {
  ViewChannel: true,
  SendMessages: true,
  ReadMessageHistory: true,
  AttachFiles: true,
};

async function resolveUser(message, argument) {
  const mentioned = message.mentions.users.first();
  if (mentioned) return mentioned;
  if (!argument) return null;

  const id = argument.replace(/[<@!>]/g, '');
  if (!/^\d{17,20}$/.test(id)) return null;

  return message.client.users.fetch(id).catch(() => null);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Manage the ticket or order you are in')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a member to this channel')
        .addUserOption((o) => o.setName('user').setDescription('Member to add').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a member from this channel')
        .addUserOption((o) => o.setName('user').setDescription('Member to remove').setRequired(true))
    )
    .addSubcommand((sub) => sub.setName('claim').setDescription('Claim this ticket or order'))
    .addSubcommand((sub) => sub.setName('unclaim').setDescription('Unclaim this ticket or order'))
    .addSubcommand((sub) =>
      sub
        .setName('close')
        .setDescription('Close this ticket or order')
        .addStringOption((o) =>
          o.setName('reason').setDescription('Reason for closing').setMaxLength(500)
        )
    ),

  // ===== slash =====
  async execute(interaction) {
    const record = getByChannel(interaction.channelId);
    if (!record) return ephemeral(interaction, 'Use this command inside an open ticket or order.');

    const sub = interaction.options.getSubcommand();
    const member = interaction.member;

    if (sub === 'claim' || sub === 'unclaim') {
      const run = sub === 'claim' ? claimCase : unclaimCase;
      const result = await run(interaction.client, interaction.channel, member);

      return result.ok
        ? interaction.reply({ content: result.message, allowedMentions: { parse: [] } })
        : ephemeral(interaction, result.message);
    }

    if (sub === 'close') {
      if (!canClose(member, record)) return ephemeral(interaction, "You can't close this.");

      await interaction.reply({
        content: `Saving the transcript and closing this ${labelOf(record).toLowerCase()}...`,
        flags: MessageFlags.Ephemeral,
      });

      return closeCase(
        interaction.client,
        interaction.channel,
        interaction.user,
        interaction.options.getString('reason') || null
      );
    }

    // add / remove are staff only
    if (!canManageCase(member, record)) {
      return ephemeral(interaction, 'You do not have permission to do that.');
    }

    const user = interaction.options.getUser('user');

    if (sub === 'add') {
      await interaction.channel.permissionOverwrites.edit(user.id, OVERWRITES);
      await logEvent(
        interaction.client,
        `➕ **${record.id}** <@${user.id}> added by <@${interaction.user.id}>`
      );

      return interaction.reply({
        content: `Added <@${user.id}> to this ${labelOf(record).toLowerCase()}.`,
        allowedMentions: { users: [user.id] },
      });
    }

    if (user.id === record.openerId) {
      return ephemeral(interaction, 'You cannot remove the person who opened this.');
    }

    await interaction.channel.permissionOverwrites.delete(user.id);
    await logEvent(
      interaction.client,
      `➖ **${record.id}** <@${user.id}> removed by <@${interaction.user.id}>`
    );

    return interaction.reply({
      content: `Removed <@${user.id}> from this ${labelOf(record).toLowerCase()}.`,
      allowedMentions: { parse: [] },
    });
  },

  // ===== prefix =====
  async prefix(message, args) {
    const record = getByChannel(message.channel.id);
    if (!record) return message.reply('Use this command inside an open ticket or order.');

    const sub = args[0]?.toLowerCase();
    if (!['add', 'remove', 'claim', 'unclaim', 'close'].includes(sub)) {
      return message.reply(
        'Commands:\n' +
          '`^ticket add @user`\n' +
          '`^ticket remove @user`\n' +
          '`^ticket claim` / `^ticket unclaim`\n' +
          '`^ticket close [reason]`'
      );
    }

    const member =
      message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
    if (!member) return;

    if (sub === 'claim' || sub === 'unclaim') {
      const run = sub === 'claim' ? claimCase : unclaimCase;
      const result = await run(message.client, message.channel, member);
      return message.reply({ content: result.message, allowedMentions: { parse: [] } });
    }

    if (sub === 'close') {
      if (!canClose(member, record)) return message.reply("You can't close this.");

      await message.reply(`Saving the transcript and closing this ${labelOf(record).toLowerCase()}...`);
      return closeCase(message.client, message.channel, message.author, args.slice(1).join(' ').trim() || null);
    }

    if (!canManageCase(member, record)) return message.reply('You do not have permission to do that.');

    const user = await resolveUser(message, args[1]);
    if (!user) return message.reply(`Usage: \`^ticket ${sub} @user\` (a user ID works too)`);

    if (sub === 'add') {
      await message.channel.permissionOverwrites.edit(user.id, OVERWRITES);
      await logEvent(message.client, `➕ **${record.id}** <@${user.id}> added by <@${message.author.id}>`);

      return message.reply({
        content: `Added <@${user.id}> to this ${labelOf(record).toLowerCase()}.`,
        allowedMentions: { users: [user.id] },
      });
    }

    if (user.id === record.openerId) return message.reply('You cannot remove the person who opened this.');

    await message.channel.permissionOverwrites.delete(user.id);
    await logEvent(message.client, `➖ **${record.id}** <@${user.id}> removed by <@${message.author.id}>`);

    return message.reply({
      content: `Removed <@${user.id}> from this ${labelOf(record).toLowerCase()}.`,
      allowedMentions: { parse: [] },
    });
  },
};