require('dotenv').config();
const { createBot } = require('./bot');
const { startWebhookServer } = require('./webhook');
const { getAllUsers } = require('./db/mappings');
const { UNREGISTERED_COMMANDS, REGISTERED_COMMANDS } = require('./utils/commands');

async function start() {
    try {
        const bot = createBot();

        // Start webhook server alongside the bot
        startWebhookServer(bot);

        // 1. Set global Telegram command menu for EVERYONE (Unregistered default limit)
        console.log('[DEBUG setMyCommands] Setting default global commands:', JSON.stringify(UNREGISTERED_COMMANDS));
        const defaultRes = await bot.telegram.setMyCommands(UNREGISTERED_COMMANDS, { scope: { type: 'default' } });
        console.log('[DEBUG setMyCommands] Global default result:', defaultRes);

        // 2. Fetch all registered users and upgrade their specific menus
        try {
            const users = await getAllUsers();
            if (users && users.length > 0) {
                console.log(`[DEBUG setMyCommands] Setting up command menus for ${users.length} registered users...`);

                for (const user of users) {
                    try {
                        console.log(`[DEBUG setMyCommands] Sending for chat_id=${user.chat_id}, telegram_user_id=${user.telegram_user_id}:`, JSON.stringify(REGISTERED_COMMANDS));
                        const userRes = await bot.telegram.setMyCommands(REGISTERED_COMMANDS, { scope: { type: 'chat', chat_id: user.chat_id } });
                        console.log(`[DEBUG setMyCommands] Result for chat_id=${user.chat_id}:`, userRes);
                    } catch (err) {
                        console.error(`[DEBUG setMyCommands] Failed to set commands for chat_id ${user.chat_id}:`, err);
                    }
                }
                console.log(`[DEBUG setMyCommands] Commands updated for registered users.`);
            } else {
                console.log('[DEBUG setMyCommands] No registered users found in database.');
            }
        } catch (dbErr) {
            console.error('[DEBUG setMyCommands] Failed to query user menus:', dbErr);
        }

        // Graceful stop listeners
        process.once('SIGINT', () => bot.stop('SIGINT'));
        process.once('SIGTERM', () => bot.stop('SIGTERM'));

        console.log('Starting Telegram bot in polling mode...');
        bot.launch();
        console.log('Bot is running and listening for messages!');

    } catch (err) {
        console.error('Failed to start the bot:', err);
        process.exit(1);
    }
}

start();
