const express = require('express');
const axios = require('axios');
const { getMappingByJiraAccountId, getMappingByTelegramId, saveMapping } = require('../db/mappings');
const { getRegisteredKeyboard, REGISTERED_COMMANDS } = require('../utils/commands');
const { setPendingRegistration } = require('../commands/link');
const { validateOAuthState, consumeOAuthState } = require('../auth/state');
const jiraClient = require('../jira/client');
const { PUBLIC_BASE_URL, escapeHtml } = require('../utils');

function renderStatusPage({ icon, color, title, bodyHtml, maxWidth = '400px' }) {
    return `
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
        <body style="background-color: #f0f2f5;">
        <div style="font-family: sans-serif; text-align: center; margin-top: 50px; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: ${maxWidth}; margin-left: auto; margin-right: auto;">
            <h1 style="color: ${color}; font-size: 48px; margin: 0;">${icon}</h1>
            <h2 style="color: #333; margin-top: 20px;">${title}</h2>
            ${bodyHtml}
        </div>
        </body>
        </html>
    `;
}

async function sendOAuthFailureMessage(bot, chatId, reasonText, source = 'link', customAction = null) {
    if (!chatId) return;
    const isChange = source === 'changeaccount';
    const title = isChange ? '❌ ការប្ដូរគណនីបានបរាជ័យ!' : '❌ ការភ្ជាប់គណនីបានបរាជ័យ!';
    const command = isChange ? '/changeaccount' : '/link';
    const action = customAction || `សូមប្រើ ${command} ម្តងទៀត ដើម្បីទទួលបានតំណភ្ជាប់ថ្មី។`;
    const message = `${title}\n\n${reasonText}\n\n${action}`;
    try {
        await bot.telegram.sendMessage(chatId, message);
    } catch (err) {
        console.error('Failed to send OAuth failure message to Telegram:', err.message);
    }
}

function normalizeUrl(url) {
    if (!url || typeof url !== 'string') return '';
    return url.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
}

function createOAuthRouter(bot) {
    const router = express.Router();

    router.get('/auth/jira', (req, res) => {
        const state = req.query.state;
        if (!state) {
            return res.status(400).send(renderStatusPage({
                icon: '❌',
                color: 'red',
                title: 'តំណភ្ជាប់មិនត្រឹមត្រូវ!',
                bodyHtml: '<p style="color: #666; font-size: 16px;">តំណភ្ជាប់នេះមិនមានសុពលភាព ឬហួសកំណត់ហើយ។ សូមព្យាយាមម្តងទៀតពី Telegram។</p>'
            }));
        }

        const stateEntry = validateOAuthState(state);
        if (!stateEntry) {
            return res.status(400).send(renderStatusPage({
                icon: '❌',
                color: 'red',
                title: 'តំណភ្ជាប់មិនត្រឹមត្រូវ!',
                bodyHtml: '<p style="color: #666; font-size: 16px;">តំណភ្ជាប់នេះមិនមានសុពលភាព ឬហួសកំណត់ហើយ។ សូមព្យាយាមម្តងទៀតពី Telegram។</p>'
            }));
        }

        const clientId = process.env.ATLASSIAN_CLIENT_ID;
        const redirectUri = `${PUBLIC_BASE_URL}/auth/callback`;
        const authUrl = `https://auth.atlassian.com/authorize?audience=api.atlassian.com&client_id=${clientId}&scope=${encodeURIComponent('read:me read:jira-user')}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&response_type=code&prompt=consent`;
        res.redirect(authUrl);
    });

    router.get('/auth/callback', async (req, res) => {
        const { code, state, error, error_description } = req.query;

        // Retrieve and consume state token immediately so we have chatId even on early failures
        const stateEntry = state ? consumeOAuthState(state) : null;
        const chatId = stateEntry?.chatId;
        const telegramUserId = stateEntry?.telegramUserId;
        const source = stateEntry?.source || 'link';
        const command = source === 'changeaccount' ? '/changeaccount' : '/link';

        if (error) {
            await sendOAuthFailureMessage(
                bot,
                chatId,
                `អ្នកបានបដិសេធការអនុញ្ញាត (Denied consent) ឬការចូលប្រើប្រាស់ត្រូវបានលុបចោល។\n\nតំណភ្ជាប់នេះឥឡូវត្រូវបានប្រើប្រាស់រួចហើយ។`,
                source
            );
            return res.status(400).send(renderStatusPage({
                icon: '❌',
                color: 'red',
                title: source === 'changeaccount' ? 'ការប្ដូរគណនីបានបរាជ័យ!' : 'ការភ្ជាប់គណនីបានបរាជ័យ!',
                bodyHtml: `
                    <p style="color: #666; font-size: 16px;">បញ្ហា៖ ${escapeHtml(error_description || error)}</p>
                    <p style="color: #666; font-size: 16px;">អ្នកអាចបិទទំព័រនេះ ហើយព្យាយាមម្តងទៀតនៅក្នុង Telegram។</p>
                `
            }));
        }
        if (!code || !state) {
            await sendOAuthFailureMessage(
                bot,
                chatId,
                `ព័ត៌មានផ្ទៀងផ្ទាត់មិនគ្រប់គ្រាន់ (Missing code or state)។\n\nតំណភ្ជាប់នេះឥឡូវត្រូវបានប្រើប្រាស់រួចហើយ។`,
                source
            );
            return res.status(400).send(renderStatusPage({
                icon: '❌',
                color: 'red',
                title: 'តំណភ្ជាប់មិនត្រឹមត្រូវ!',
                bodyHtml: '<p style="color: #666; font-size: 16px;">Missing code or state.</p>'
            }));
        }

        if (!stateEntry) {
            return res.status(400).send(renderStatusPage({
                icon: '❌',
                color: 'red',
                title: 'តំណភ្ជាប់មិនត្រឹមត្រូវ!',
                bodyHtml: '<p style="color: #666; font-size: 16px;">តំណភ្ជាប់នេះត្រូវបានប្រើប្រាស់រួច ឬហួសកំណត់ហើយ។ សូមព្យាយាមម្តងទៀតពី Telegram។</p>'
            }));
        }

        let currentUserMapping = null;
        if (telegramUserId) {
            try {
                currentUserMapping = await getMappingByTelegramId(telegramUserId);
            } catch (err) {
                console.error('Error fetching user mapping for stale state check:', err);
            }
        }

        // Stale state check: did their registration status change since the link was generated?
        if (source === 'changeaccount' && !currentUserMapping) {
            await sendOAuthFailureMessage(
                bot,
                chatId,
                `អ្នកមិនទាន់បានភ្ជាប់គណនីនៅឡើយទេ។\n\nតំណភ្ជាប់សម្រាប់ការប្តូរគណនីនេះមិនអាចប្រើបានទេ។`,
                source,
                `សូមប្រើ /link ជំនួសវិញ ដើម្បីភ្ជាប់គណនីជាលើកដំបូង។`
            );
            return res.status(400).send(renderStatusPage({
                icon: '⚠️',
                color: 'orange',
                title: 'មិនត្រឹមត្រូវ!',
                bodyHtml: `
                    <p style="color: #666; font-size: 16px;">តំណភ្ជាប់នេះគឺសម្រាប់ប្តូរគណនី ប៉ុន្តែអ្នកមិនទាន់មានគណនីដែលបានភ្ជាប់នៅឡើយទេ។</p>
                    <p style="color: #666; font-size: 16px;">សូមប្រើ /link នៅក្នុង Telegram ដើម្បីភ្ជាប់គណនីជាលើកដំបូង។</p>
                `
            }));
        }

        if (source === 'link' && currentUserMapping) {
            await sendOAuthFailureMessage(
                bot,
                chatId,
                `អ្នកបានភ្ជាប់គណនីរួចហើយ។\n\nតំណភ្ជាប់សម្រាប់ការភ្ជាប់គណនីថ្មីនេះមិនអាចប្រើបានទេ។`,
                source,
                `សូមប្រើ /changeaccount ជំនួសវិញ ដើម្បីប្តូរគណនី Jira របស់អ្នក។`
            );
            return res.status(400).send(renderStatusPage({
                icon: '⚠️',
                color: 'orange',
                title: 'មិនត្រឹមត្រូវ!',
                bodyHtml: `
                    <p style="color: #666; font-size: 16px;">តំណភ្ជាប់នេះគឺសម្រាប់អ្នកដែលមិនទាន់ភ្ជាប់គណនី ប៉ុន្តែអ្នកបានភ្ជាប់គណនីរួចហើយ។</p>
                    <p style="color: #666; font-size: 16px;">សូមប្រើ /changeaccount នៅក្នុង Telegram ជាថ្មី ដើម្បីប្តូរគណនី។</p>
                `
            }));
        }

        const redirectUri = `${PUBLIC_BASE_URL}/auth/callback`;

        try {
            const tokenResponse = await axios.post('https://auth.atlassian.com/oauth/token', {
                grant_type: 'authorization_code',
                client_id: process.env.ATLASSIAN_CLIENT_ID,
                client_secret: process.env.ATLASSIAN_CLIENT_SECRET,
                code: code,
                redirect_uri: redirectUri
            });

            const accessToken = tokenResponse.data.access_token;

            // Verify if authorized site matches our Jira instance
            let hasAccessToOurSite = false;
            try {
                const resourcesResponse = await axios.get('https://api.atlassian.com/oauth/token/accessible-resources', {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        Accept: 'application/json'
                    }
                });

                const expectedUrl = normalizeUrl(process.env.JIRA_BASE_URL);
                const expectedCloudId = process.env.JIRA_CLOUD_ID ? process.env.JIRA_CLOUD_ID.trim() : null;

                if (Array.isArray(resourcesResponse.data)) {
                    hasAccessToOurSite = resourcesResponse.data.some(resource => {
                        if (expectedCloudId && resource.id === expectedCloudId) return true;
                        const resourceUrl = normalizeUrl(resource.url);
                        return Boolean(expectedUrl && resourceUrl && resourceUrl === expectedUrl);
                    });
                }

                if (process.env.DEBUG === 'true') {
                    console.log('OAuth accessible resources:', resourcesResponse.data?.map(r => ({ id: r.id, url: r.url })));
                    console.log('Expected Jira site URL:', expectedUrl, 'hasAccessToOurSite:', hasAccessToOurSite);
                }
            } catch (resourceErr) {
                console.error('Error fetching accessible resources:', resourceErr.message);
            }

            if (!hasAccessToOurSite) {
                const actionButton = source === 'changeaccount' ? '"🔄 ប្តូរគណនី"' : '"🔗 ភ្ជាប់គណនី Jira"';
                const recoveryAction =
                    `សូមអនុវត្តតាមជំហានដោះស្រាយ៖\n` +
                    `1️⃣ ចេញពីគណនី Atlassian នៅ https://id.atlassian.com (Log out)\n` +
                    `2️⃣ ចូលគណនី Atlassian ដែលអ្នកប្រើជាមួយ Jira ឡើងវិញ\n` +
                    `3️⃣ ចុចប៊ូតុង ${actionButton} (ឬ ${command}) ម្តងទៀត ដើម្បីទទួលបានតំណភ្ជាប់ថ្មី`;

                await sendOAuthFailureMessage(
                    bot,
                    chatId,
                    `អ្នកបានជ្រើសរើស Site Jira ដែលមិនត្រឹមត្រូវ។\n\nតំណភ្ជាប់នេះឥឡូវត្រូវបានប្រើប្រាស់រួចហើយ។`,
                    source,
                    recoveryAction
                );
                return res.status(403).send(renderStatusPage({
                    icon: '❌',
                    color: 'red',
                    title: 'ការអនុញ្ញាតត្រូវបានបដិសេធ!',
                    maxWidth: '440px',
                    bodyHtml: `
                        <p style="color: #666; font-size: 16px;">អ្នកបានជ្រើសរើស Site Jira ដែលមិនត្រឹមត្រូវ។</p>
                        <div style="color: #444; font-size: 14px; text-align: left; background: #f8f9fa; padding: 14px; border-radius: 8px; margin-top: 20px; line-height: 1.6;">
                            <strong>ជំហានដោះស្រាយ៖</strong><br>
                            1. ចេញពីគណនី Atlassian នៅ <a href="https://id.atlassian.com" target="_blank" style="color: #0052cc;">id.atlassian.com</a><br>
                            2. ចូលគណនីដែលអ្នកប្រើជាមួយ Jira ឡើងវិញ<br>
                            3. ត្រឡប់ទៅ Telegram ហើយចុច ${actionButton} ម្តងទៀត
                        </div>
                    `
                }));
            }

            const meResponse = await axios.get('https://api.atlassian.com/me', {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });

            const { account_id, email: meEmail, name } = meResponse.data;

            // Verify account exists in Jira and fetch Jira profile
            let jiraUser = null;
            try {
                jiraUser = await jiraClient.getUserByAccountId(account_id);
            } catch (jiraErr) {
                console.error('Error fetching Jira user by accountId during OAuth callback:', jiraErr.message);
            }

            if (!jiraUser || !jiraUser.accountId) {
                const actionButton = source === 'changeaccount' ? '"🔄 ប្តូរគណនី"' : '"🔗 ភ្ជាប់គណនី Jira"';
                const recoveryAction =
                    `សូមអនុវត្តតាមជំហានដោះស្រាយ៖\n` +
                    `1️⃣ ចេញពីគណនី Atlassian នៅ https://id.atlassian.com (Log out)\n` +
                    `2️⃣ ចូលគណនី Atlassian ដែលអ្នកប្រើជាមួយ Jira ឡើងវិញ\n` +
                    `3️⃣ ចុចប៊ូតុង ${actionButton} (ឬ ${command}) ម្តងទៀត ដើម្បីទទួលបានតំណភ្ជាប់ថ្មី`;

                await sendOAuthFailureMessage(
                    bot,
                    chatId,
                    `គណនី Atlassian របស់អ្នកមិនមានសិទ្ធិចូលប្រើប្រាស់ Jira នេះទេ ឬមិនត្រូវបានរកឃើញ។\n\nតំណភ្ជាប់នេះឥឡូវត្រូវបានប្រើប្រាស់រួចហើយ។`,
                    source,
                    recoveryAction
                );
                return res.status(404).send(renderStatusPage({
                    icon: '❌',
                    color: 'red',
                    title: 'រកមិនឃើញគណនី Jira!',
                    maxWidth: '440px',
                    bodyHtml: `
                        <p style="color: #666; font-size: 16px;">គណនី Atlassian របស់អ្នកមិនមានសិទ្ធិចូលប្រើប្រាស់ Jira នេះទេ ឬមិនត្រូវបានរកឃើញ។</p>
                        <div style="color: #444; font-size: 14px; text-align: left; background: #f8f9fa; padding: 14px; border-radius: 8px; margin-top: 20px; line-height: 1.6;">
                            <strong>ជំហានដោះស្រាយ៖</strong><br>
                            1. ចេញពីគណនី Atlassian នៅ <a href="https://id.atlassian.com" target="_blank" style="color: #0052cc;">id.atlassian.com</a><br>
                            2. ចូលគណនីដែលអ្នកប្រើជាមួយ Jira ឡើងវិញ<br>
                            3. ត្រឡប់ទៅ Telegram ហើយចុច ${actionButton} ម្តងទៀត
                        </div>
                    `
                }));
            }

            const verifiedAccountId = jiraUser.accountId;
            if (process.env.DEBUG === 'true') {
                console.log('OAuth verified Jira account:', { atlassianAccountId: account_id, jiraAccountId: verifiedAccountId });
            }

            const finalEmail = meEmail || jiraUser.emailAddress;
            if (!finalEmail) {
                await sendOAuthFailureMessage(
                    bot,
                    chatId,
                    `មិនអាចទាញយកអ៊ីមែលពីគណនី Jira របស់អ្នកបានទេ។\n\nតំណភ្ជាប់នេះឥឡូវត្រូវបានប្រើប្រាស់រួចហើយ។`,
                    source,
                    `សូមពិនិត្យមើលការកំណត់ភាពឯកជននៃអ៊ីមែលនៅក្នុងគណនី Atlassian របស់អ្នក រួចប្រើ ${command} ម្តងទៀត។`
                );
                return res.status(400).send(renderStatusPage({
                    icon: '❌',
                    color: 'red',
                    title: 'មិនមានអ៊ីមែល!',
                    bodyHtml: '<p style="color: #666; font-size: 16px;">មិនអាចទាញយកអ៊ីមែលពីគណនី Jira របស់អ្នកបានទេ។ សូមពិនិត្យមើលការកំណត់ភាពឯកជននៃអ៊ីមែលនៅក្នុងគណនី Atlassian របស់អ្នក។</p>'
                }));
            }

            const displayName = jiraUser.displayName || name || finalEmail;

            // Check if Jira account mapped to another Telegram user
            const existingMapping = await getMappingByJiraAccountId(verifiedAccountId);
            if (existingMapping && existingMapping.telegram_user_id !== telegramUserId) {
                await sendOAuthFailureMessage(
                    bot,
                    chatId,
                    `គណនី Jira នេះត្រូវបានភ្ជាប់ជាមួយគណនី Telegram ផ្សេងរួចហើយ។\n\nតំណភ្ជាប់នេះឥឡូវត្រូវបានប្រើប្រាស់រួចហើយ។`,
                    source,
                    `សូមផ្តាច់គណនីនោះសិន ឬប្រើប្រាស់គណនី Jira ផ្សេង រួចប្រើ ${command} ម្តងទៀត។`
                );
                return res.send(renderStatusPage({
                    icon: '⚠️',
                    color: 'orange',
                    title: 'មិនអាចភ្ជាប់បានទេ!',
                    bodyHtml: `
                        <p style="color: #666; font-size: 16px;">គណនី Jira នេះត្រូវបានភ្ជាប់ជាមួយគណនី Telegram ផ្សេងរួចហើយ។</p>
                        <p style="color: #666; font-size: 16px;">សូមផ្តាច់គណនីនោះសិន ឬប្រើប្រាស់គណនី Jira ផ្សេង។</p>
                    `
                }));
            }

            // Check if this Telegram user already has an existing mapping
            const existingUserMapping = await getMappingByTelegramId(telegramUserId);

            if (existingUserMapping) {
                // If it's already linked to this exact Jira account
                if (existingUserMapping.jira_account_id === verifiedAccountId) {
                    const message = `ℹ️ គណនី Jira របស់អ្នក (${finalEmail}) ត្រូវបានភ្ជាប់រួចរាល់ហើយ។\n\n` +
                                    `សូមប្រើប្រាស់ប៊ូតុងខាងក្រោមដើម្បីមើលកិច្ចការរបស់អ្នក។ 👇`;

                    await bot.telegram.sendMessage(chatId, message, getRegisteredKeyboard());
                    await bot.telegram.setMyCommands(REGISTERED_COMMANDS, { scope: { type: 'chat', chat_id: chatId } }).catch(err => console.error(err));

                    return res.send(renderStatusPage({
                        icon: '✅',
                        color: '#4CAF50',
                        title: 'គណនីបានភ្ជាប់រួចហើយ!',
                        bodyHtml: `
                            <p style="color: #666; font-size: 16px;">គណនីរបស់អ្នក (${finalEmail}) ត្រូវបានភ្ជាប់រួចរាល់ហើយ។</p>
                            <p style="color: #666; font-size: 16px;">អ្នកអាចបិទទំព័រនេះ ហើយត្រឡប់ទៅ Telegram វិញបាន។</p>
                        `
                    }));
                }

                // If user is switching to a different Jira account, require explicit confirmation
                setPendingRegistration(telegramUserId, {
                    status: 'PENDING_CONFIRM',
                    chatId,
                    accountId: verifiedAccountId,
                    email: finalEmail,
                    displayName,
                    existingMapping: existingUserMapping
                });

                const oldEmail = existingUserMapping.jira_email || 'គណនីមុន';
                const confirmMsg =
                    `⚠️ ការបញ្ជាក់ប្តូរគណនី Jira:\n\n` +
                    `អ្នកបានផ្ទៀងផ្ទាត់គណនី Atlassian ថ្មី: ${displayName} (${finalEmail})\n` +
                    `តើអ្នកពិតជាចង់ប្តូរគណនីពី ${oldEmail} ទៅ ${finalEmail} មែនទេ? សូមជ្រើសរើសខាងក្រោម៖`;

                await bot.telegram.sendMessage(chatId, confirmMsg, {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ បាទ/ចាស (ប្តូរគណនី)', callback_data: 'confirm_register' },
                                { text: '❌ ទេ (បោះបង់)', callback_data: 'cancel_register' }
                            ]
                        ]
                    }
                });

                return res.send(renderStatusPage({
                    icon: '⏳',
                    color: '#FF9800',
                    title: 'សូមបញ្ជាក់នៅក្នុង Telegram!',
                    bodyHtml: `
                        <p style="color: #666; font-size: 16px;">អ្នកមានគណនី Jira ដែលបានភ្ជាប់រួចហើយ (${oldEmail})។</p>
                        <p style="color: #666; font-size: 16px;">សារបញ្ជាក់ត្រូវបានផ្ញើទៅកាន់ Telegram របស់អ្នកដើម្បីអនុញ្ញាតការប្តូរទៅកាន់ ${finalEmail}។</p>
                        <p style="color: #666; font-size: 16px;">អ្នកអាចបិទទំព័រនេះ ហើយត្រឡប់ទៅកាន់ Telegram បាន។</p>
                    `
                }));
            }

            // Save mapping (telegramUserId, chatId, verifiedAccountId, finalEmail, displayName)
            await saveMapping(telegramUserId, chatId, verifiedAccountId, finalEmail, displayName);

            // Send confirmation Telegram message
            const message = `🎉 សូមអបអរសាទរ! គណនី Jira របស់អ្នកពិតជាត្រឹមត្រូវហើយត្រូវបានភ្ជាប់ដោយជោគជ័យ។\n\n` +
                            `👤 គណនី: ${finalEmail}\n\n` +
                            `សូមប្រើប្រាស់ប៊ូតុងខាងក្រោមដើម្បីមើលកិច្ចការរបស់អ្នក។ 👇`;

            await bot.telegram.sendMessage(chatId, message, getRegisteredKeyboard());
            await bot.telegram.setMyCommands(REGISTERED_COMMANDS, { scope: { type: 'chat', chat_id: chatId } }).catch(err => console.error(err));

            res.send(renderStatusPage({
                icon: '✅',
                color: '#4CAF50',
                title: 'ការភ្ជាប់គណនីជោគជ័យ!',
                bodyHtml: `
                    <p style="color: #666; font-size: 16px;">គណនីរបស់អ្នក (${finalEmail}) ត្រូវបានភ្ជាប់។</p>
                    <p style="color: #666; font-size: 16px;">អ្នកអាចបិទទំព័រនេះ ហើយត្រឡប់ទៅ Telegram វិញបាន។</p>
                `
            }));
        } catch (err) {
            console.error('Error in OAuth callback:', err.response?.data || err.message);
            await sendOAuthFailureMessage(
                bot,
                chatId,
                `មានបញ្ហាក្នុងការ${source === 'changeaccount' ? 'ប្ដូរ' : 'ភ្ជាប់'}គណនីរបស់អ្នក។\n\nតំណភ្ជាប់នេះឥឡូវត្រូវបានប្រើប្រាស់រួចហើយ។`,
                source
            );
            res.status(500).send(renderStatusPage({
                icon: '❌',
                color: 'red',
                title: 'មានបញ្ហា!',
                bodyHtml: `<p style="color: #666; font-size: 16px;">បរាជ័យក្នុងការ${source === 'changeaccount' ? 'ប្ដូរ' : 'ភ្ជាប់'}គណនីរបស់អ្នក។ សូមព្យាយាមម្តងទៀត។</p>`
            }));
        }
    });

    return router;
}

module.exports = {
    createOAuthRouter,
    renderStatusPage
};
