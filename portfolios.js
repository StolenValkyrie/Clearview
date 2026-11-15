const fs = require('node:fs');
const path = require('node:path');

const ALLOWED_ROLES = [
  '1473791721505558712', // Managers / Management Team
  '1479633812341264607', // Overseers / Oversight Team
  '1473791717227364462', // Executive Board
];

const FILE = path.join(__dirname, 'portfolios.json');
let data = {};

try {
  data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch {
  data = {};
}

const save = () => fs.writeFileSync(FILE, JSON.stringify(data, null, 2));

// Remember which designer owns which post
function registerPortfolio(threadId, designerId) {
  data[threadId] = designerId;
  save();
}

async function handlePortfolioMessage(message) {
  if (message.author.bot) return;
  if (!message.guild || !message.channel.isThread()) return;

  const designerId = data[message.channel.id];
  if (!designerId) return; // not a portfolio post

  if (message.author.id === designerId) return;

  const member =
    message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (member && ALLOWED_ROLES.some((roleId) => member.roles.cache.has(roleId))) return;

  await message.delete().catch(console.error);
}

module.exports = { ALLOWED_ROLES, registerPortfolio, handlePortfolioMessage };