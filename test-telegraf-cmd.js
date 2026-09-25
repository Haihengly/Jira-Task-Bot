const { Telegraf } = require('telegraf');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
bot.telegram.setMyCommands([{ command: 'ផ្ដាច់ការប្រើប្រាស់', description: 'Unlink' }])
  .then(console.log).catch(console.error);
