const {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Gives the current ping for the bot.'),

  async execute(interaction) {
    const container = new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`Ping is: ${interaction.client.ws.ping}ms`)
      );

    return container;
  },
};