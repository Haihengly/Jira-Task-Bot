const express = require('express');
const axios = require('axios');
const { getMappingByJiraAccountId, getMappingByTelegramId, saveMapping } = require('./db/mappings');
const { getRegisteredKeyboard, REGISTERED_COMMANDS } = require('./utils/commands');
const { setPendingRegistration } = require('./commands/link');
const { validateOAuthState, consumeOAuthState } = require('./auth/state');
const jiraClient = require('./jira/client');
const { getTodayDateString, formatPriorityAndDue, escapeMarkdown } = require('./utils');
const { generateMultiSectionReport, generateMorningCronReport, generateTaskReport } = require('./pdf/generateTaskReport');

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

async function enrichIssueFields(issueKey, issueFields) {
    if (issueKey && (!issueFields || issueFields.priority === undefined || issueFields.duedate === undefined || !issueFields.project || !issueFields.summary)) {
        try {
            const fetched = await jiraClient.getIssueByKey(issueKey, 'summary,priority,duedate,project');
            if (fetched && fetched.fields) {
                return {
                    ...issueFields,
                    ...fetched.fields
                };
            }
        } catch (error) {
            console.error(`Failed to fetch additional Jira issue fields for ${issueKey}:`, error.message);
        }
    }
    return issueFields;
}

async function sendNotification(bot, chatId, markdownMessage, plainMessage, logContext) {
    try {
        await bot.telegram.sendMessage(chatId, markdownMessage, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        });
        console.log(`Delivered ${logContext} to chat ${chatId}`);
    } catch (telegramErr) {
        console.error(`Failed to send Telegram message to chat ${chatId}:`, telegramErr.message || telegramErr);

        // Fallback to plain text if Markdown parsing fails
        try {
            await bot.telegram.sendMessage(chatId, plainMessage, {
                disable_web_page_preview: true
            });
        } catch (fallbackErr) {
            console.error(`Failed to send fallback Telegram message to chat ${chatId}:`, fallbackErr.message || fallbackErr);
        }
    }
}

function startWebhookServer(bot) {
    const app = express();
    const port = process.env.PORT || 3030;

    // Parse JSON bodies
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    app.get('/auth/jira', (req, res) => {
        const state = req.query.state;
        if (!state) {
            return res.status(400).send(`
                <html>
                <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
                <body style="background-color: #f0f2f5;">
                <div style="font-family: sans-serif; text-align: center; margin-top: 50px; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px; margin-left: auto; margin-right: auto;">
                    <h1 style="color: red; font-size: 48px; margin: 0;">❌</h1>
                    <h2 style="color: #333; margin-top: 20px;">តំណភ្ជាប់មិនត្រឹមត្រូវ!</h2>
                    <p style="color: #666; font-size: 16px;">តំណភ្ជាប់នេះមិនមានសុពលភាព ឬហួសកំណត់ហើយ។ សូមព្យាយាមម្តងទៀតពី Telegram។</p>
                </div>
                </body>
                </html>
            `);
        }

        const stateEntry = validateOAuthState(state);
        if (!stateEntry) {
            return res.status(400).send(`
                <html>
                <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
                <body style="background-color: #f0f2f5;">
                <div style="font-family: sans-serif; text-align: center; margin-top: 50px; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px; margin-left: auto; margin-right: auto;">
                    <h1 style="color: red; font-size: 48px; margin: 0;">❌</h1>
                    <h2 style="color: #333; margin-top: 20px;">តំណភ្ជាប់មិនត្រឹមត្រូវ!</h2>
                    <p style="color: #666; font-size: 16px;">តំណភ្ជាប់នេះមិនមានសុពលភាព ឬហួសកំណត់ហើយ។ សូមព្យាយាមម្តងទៀតពី Telegram។</p>
                </div>
                </body>
                </html>
            `);
        }

        const clientId = process.env.ATLASSIAN_CLIENT_ID;
        const redirectUri = 'https://jirabot.kaizenops.site/auth/callback';
        const authUrl = `https://auth.atlassian.com/authorize?audience=api.atlassian.com&client_id=${clientId}&scope=${encodeURIComponent('read:me read:jira-user')}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&response_type=code&prompt=consent`;
        res.redirect(authUrl);
    });

    app.get('/auth/callback', async (req, res) => {
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
            return res.status(400).send(`
                <html>
                <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
                <body style="background-color: #f0f2f5;">
                <div style="font-family: sans-serif; text-align: center; margin-top: 50px; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px; margin-left: auto; margin-right: auto;">
                    <h1 style="color: red; font-size: 48px; margin: 0;">❌</h1>
                    <h2 style="color: #333; margin-top: 20px;">${source === 'changeaccount' ? 'ការប្ដូរគណនីបានបរាជ័យ!' : 'ការភ្ជាប់គណនីបានបរាជ័យ!'}</h2>
                    <p style="color: #666; font-size: 16px;">បញ្ហា៖ ${escapeMarkdown(error_description || error)}</p>
                    <p style="color: #666; font-size: 16px;">អ្នកអាចបិទទំព័រនេះ ហើយព្យាយាមម្តងទៀតនៅក្នុង Telegram។</p>
                </div>
                </body>
                </html>
            `);
        }
        if (!code || !state) {
            await sendOAuthFailureMessage(
                bot,
                chatId,
                `ព័ត៌មានផ្ទៀងផ្ទាត់មិនគ្រប់គ្រាន់ (Missing code or state)។\n\nតំណភ្ជាប់នេះឥឡូវត្រូវបានប្រើប្រាស់រួចហើយ។`,
                source
            );
            return res.status(400).send(`
                <html>
                <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
                <body style="background-color: #f0f2f5;">
                <div style="font-family: sans-serif; text-align: center; margin-top: 50px; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px; margin-left: auto; margin-right: auto;">
                    <h1 style="color: red; font-size: 48px; margin: 0;">❌</h1>
                    <h2 style="color: #333; margin-top: 20px;">តំណភ្ជាប់មិនត្រឹមត្រូវ!</h2>
                    <p style="color: #666; font-size: 16px;">Missing code or state.</p>
                </div>
                </body>
                </html>
            `);
        }

        if (!stateEntry) {
            return res.status(400).send(`
                <html>
                <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
                <body style="background-color: #f0f2f5;">
                <div style="font-family: sans-serif; text-align: center; margin-top: 50px; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px; margin-left: auto; margin-right: auto;">
                    <h1 style="color: red; font-size: 48px; margin: 0;">❌</h1>
                    <h2 style="color: #333; margin-top: 20px;">តំណភ្ជាប់មិនត្រឹមត្រូវ!</h2>
                    <p style="color: #666; font-size: 16px;">តំណភ្ជាប់នេះត្រូវបានប្រើប្រាស់រួច ឬហួសកំណត់ហើយ។ សូមព្យាយាមម្តងទៀតពី Telegram។</p>
                </div>
                </body>
                </html>
            `);
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
            return res.status(400).send(`
                <html>
                <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
                <body style="background-color: #f0f2f5;">
                <div style="font-family: sans-serif; text-align: center; margin-top: 50px; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px; margin-left: auto; margin-right: auto;">
                    <h1 style="color: orange; font-size: 48px; margin: 0;">⚠️</h1>
                    <h2 style="color: #333; margin-top: 20px;">មិនត្រឹមត្រូវ!</h2>
                    <p style="color: #666; font-size: 16px;">តំណភ្ជាប់នេះគឺសម្រាប់ប្តូរគណនី ប៉ុន្តែអ្នកមិនទាន់មានគណនីដែលបានភ្ជាប់នៅឡើយទេ។</p>
                    <p style="color: #666; font-size: 16px;">សូមប្រើ /link នៅក្នុង Telegram ដើម្បីភ្ជាប់គណនីជាលើកដំបូង។</p>
                </div>
                </body>
                </html>
            `);
        }

        if (source === 'link' && currentUserMapping) {
            await sendOAuthFailureMessage(
                bot,
                chatId,
                `អ្នកបានភ្ជាប់គណនីរួចហើយ។\n\nតំណភ្ជាប់សម្រាប់ការភ្ជាប់គណនីថ្មីនេះមិនអាចប្រើបានទេ។`,
                source,
                `សូមប្រើ /changeaccount ជំនួសវិញ ដើម្បីប្តូរគណនី Jira របស់អ្នក។`
            );
            return res.status(400).send(`
                <html>
                <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
                <body style="background-color: #f0f2f5;">
                <div style="font-family: sans-serif; text-align: center; margin-top: 50px; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px; margin-left: auto; margin-right: auto;">
                    <h1 style="color: orange; font-size: 48px; margin: 0;">⚠️</h1>
                    <h2 style="color: #333; margin-top: 20px;">មិនត្រឹមត្រូវ!</h2>
                    <p style="color: #666; font-size: 16px;">តំណភ្ជាប់នេះគឺសម្រាប់អ្នកដែលមិនទាន់ភ្ជាប់គណនី ប៉ុន្តែអ្នកបានភ្ជាប់គណនីរួចហើយ។</p>
                    <p style="color: #666; font-size: 16px;">សូមប្រើ /changeaccount នៅក្នុង Telegram ជាថ្មី ដើម្បីប្តូរគណនី។</p>
                </div>
                </body>
                </html>
            `);
        }

        const redirectUri = 'https://jirabot.kaizenops.site/auth/callback';

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
                await sendOAuthFailureMessage(
                    bot,
                    chatId,
                    `អ្នកបានជ្រើសរើស Site Jira ដែលមិនត្រឹមត្រូវ។\n\nតំណភ្ជាប់នេះឥឡូវត្រូវបានប្រើប្រាស់រួចហើយ។`,
                    source,
                    `សូមប្រើ ${command} ម្តងទៀត ដើម្បីទទួលបានតំណភ្ជាប់ថ្មី ហើយជ្រើសរើស Site ត្រឹមត្រូវ។`
                );
                return res.status(403).send(`
                    <html>
                    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
                    <body style="background-color: #f0f2f5;">
                    <div style="font-family: sans-serif; text-align: center; margin-top: 50px; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px; margin-left: auto; margin-right: auto;">
                        <h1 style="color: red; font-size: 48px; margin: 0;">❌</h1>
                        <h2 style="color: #333; margin-top: 20px;">ការអនុញ្ញាតត្រូវបានបដិសេធ!</h2>
                        <p style="color: #666; font-size: 16px;">អ្នកបានជ្រើសរើស Site Jira ដែលមិនត្រឹមត្រូវ។ សូមជ្រើសរើស Site ដែលជាផ្លូវការរបស់យើង ពេលអ្នកអនុញ្ញាតកម្មវិធី។</p>
                    </div>
                    </body>
                    </html>
                `);
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
                await sendOAuthFailureMessage(
                    bot,
                    chatId,
                    `គណនី Atlassian របស់អ្នកមិនមានសិទ្ធិចូលប្រើប្រាស់ Jira នេះទេ ឬមិនត្រូវបានរកឃើញ។\n\nតំណភ្ជាប់នេះឥឡូវត្រូវបានប្រើប្រាស់រួចហើយ។`,
                    source
                );
                return res.status(404).send(`
                    <html>
                    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
                    <body style="background-color: #f0f2f5;">
                    <div style="font-family: sans-serif; text-align: center; margin-top: 50px; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px; margin-left: auto; margin-right: auto;">
                        <h1 style="color: red; font-size: 48px; margin: 0;">❌</h1>
                        <h2 style="color: #333; margin-top: 20px;">រកមិនឃើញគណនី Jira!</h2>
                        <p style="color: #666; font-size: 16px;">គណនី Atlassian របស់អ្នកមិនមានសិទ្ធិចូលប្រើប្រាស់ Jira នេះទេ ឬមិនត្រូវបានរកឃើញ។</p>
                    </div>
                    </body>
                    </html>
                `);
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
                return res.status(400).send(`
                    <html>
                    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
                    <body style="background-color: #f0f2f5;">
                    <div style="font-family: sans-serif; text-align: center; margin-top: 50px; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px; margin-left: auto; margin-right: auto;">
                        <h1 style="color: red; font-size: 48px; margin: 0;">❌</h1>
                        <h2 style="color: #333; margin-top: 20px;">មិនមានអ៊ីមែល!</h2>
                        <p style="color: #666; font-size: 16px;">មិនអាចទាញយកអ៊ីមែលពីគណនី Jira របស់អ្នកបានទេ។ សូមពិនិត្យមើលការកំណត់ភាពឯកជននៃអ៊ីមែលនៅក្នុងគណនី Atlassian របស់អ្នក។</p>
                    </div>
                    </body>
                    </html>
                `);
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
                return res.send(`
                    <html>
                    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
                    <body style="background-color: #f0f2f5;">
                    <div style="font-family: sans-serif; text-align: center; margin-top: 50px; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px; margin-left: auto; margin-right: auto;">
                        <h1 style="color: orange; font-size: 48px; margin: 0;">⚠️</h1>
                        <h2 style="color: #333; margin-top: 20px;">មិនអាចភ្ជាប់បានទេ!</h2>
                        <p style="color: #666; font-size: 16px;">គណនី Jira នេះត្រូវបានភ្ជាប់ជាមួយគណនី Telegram ផ្សេងរួចហើយ។</p>
                        <p style="color: #666; font-size: 16px;">សូមផ្តាច់គណនីនោះសិន ឬប្រើប្រាស់គណនី Jira ផ្សេង។</p>
                    </div>
                    </body>
                    </html>
                `);
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

                    return res.send(`
                        <html>
                        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
                        <body style="background-color: #f0f2f5;">
                        <div style="font-family: sans-serif; text-align: center; margin-top: 50px; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px; margin-left: auto; margin-right: auto;">
                            <h1 style="color: #4CAF50; font-size: 48px; margin: 0;">✅</h1>
                            <h2 style="color: #333; margin-top: 20px;">គណនីបានភ្ជាប់រួចហើយ!</h2>
                            <p style="color: #666; font-size: 16px;">គណនីរបស់អ្នក (${finalEmail}) ត្រូវបានភ្ជាប់រួចរាល់ហើយ។</p>
                            <p style="color: #666; font-size: 16px;">អ្នកអាចបិទទំព័រនេះ ហើយត្រឡប់ទៅ Telegram វិញបាន។</p>
                        </div>
                        </body>
                        </html>
                    `);
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

                return res.send(`
                    <html>
                    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
                    <body style="background-color: #f0f2f5;">
                    <div style="font-family: sans-serif; text-align: center; margin-top: 50px; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px; margin-left: auto; margin-right: auto;">
                        <h1 style="color: #FF9800; font-size: 48px; margin: 0;">⏳</h1>
                        <h2 style="color: #333; margin-top: 20px;">សូមបញ្ជាក់នៅក្នុង Telegram!</h2>
                        <p style="color: #666; font-size: 16px;">អ្នកមានគណនី Jira ដែលបានភ្ជាប់រួចហើយ (${oldEmail})។</p>
                        <p style="color: #666; font-size: 16px;">សារបញ្ជាក់ត្រូវបានផ្ញើទៅកាន់ Telegram របស់អ្នកដើម្បីអនុញ្ញាតការប្តូរទៅកាន់ ${finalEmail}។</p>
                        <p style="color: #666; font-size: 16px;">អ្នកអាចបិទទំព័រនេះ ហើយត្រឡប់ទៅកាន់ Telegram បាន។</p>
                    </div>
                    </body>
                    </html>
                `);
            }

            // Save mapping (telegramUserId, chatId, verifiedAccountId, finalEmail, displayName)
            await saveMapping(telegramUserId, chatId, verifiedAccountId, finalEmail, displayName);

            // Send confirmation Telegram message
            const message = `🎉 សូមអបអរសាទរ! គណនី Jira របស់អ្នកពិតជាត្រឹមត្រូវហើយត្រូវបានភ្ជាប់ដោយជោគជ័យ។\n\n` +
                            `👤 គណនី: ${finalEmail}\n\n` +
                            `សូមប្រើប្រាស់ប៊ូតុងខាងក្រោមដើម្បីមើលកិច្ចការរបស់អ្នក។ 👇`;

            await bot.telegram.sendMessage(chatId, message, getRegisteredKeyboard());
            await bot.telegram.setMyCommands(REGISTERED_COMMANDS, { scope: { type: 'chat', chat_id: chatId } }).catch(err => console.error(err));

            res.send(`
                <html>
                <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
                <body style="background-color: #f0f2f5;">
                <div style="font-family: sans-serif; text-align: center; margin-top: 50px; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px; margin-left: auto; margin-right: auto;">
                    <h1 style="color: #4CAF50; font-size: 48px; margin: 0;">✅</h1>
                    <h2 style="color: #333; margin-top: 20px;">ការភ្ជាប់គណនីជោគជ័យ!</h2>
                    <p style="color: #666; font-size: 16px;">គណនីរបស់អ្នក (${finalEmail}) ត្រូវបានភ្ជាប់។</p>
                    <p style="color: #666; font-size: 16px;">អ្នកអាចបិទទំព័រនេះ ហើយត្រឡប់ទៅ Telegram វិញបាន។</p>
                </div>
                </body>
                </html>
            `);
        } catch (err) {
            console.error('Error in OAuth callback:', err.response?.data || err.message);
            await sendOAuthFailureMessage(
                bot,
                chatId,
                `មានបញ្ហាក្នុងការ${source === 'changeaccount' ? 'ប្ដូរ' : 'ភ្ជាប់'}គណនីរបស់អ្នក។\n\nតំណភ្ជាប់នេះឥឡូវត្រូវបានប្រើប្រាស់រួចហើយ។`,
                source
            );
            res.status(500).send(`
                <html>
                <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
                <body style="background-color: #f0f2f5;">
                <div style="font-family: sans-serif; text-align: center; margin-top: 50px; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px; margin-left: auto; margin-right: auto;">
                    <h1 style="color: red; font-size: 48px; margin: 0;">❌</h1>
                    <h2 style="color: #333; margin-top: 20px;">មានបញ្ហា!</h2>
                    <p style="color: #666; font-size: 16px;">បរាជ័យក្នុងការ${source === 'changeaccount' ? 'ប្ដូរ' : 'ភ្ជាប់'}គណនីរបស់អ្នក។ សូមព្យាយាមម្តងទៀត។</p>
                </div>
                </body>
                </html>
            `);
        }
    });

    
    app.post('/internal/generate-report', async (req, res) => {
        try {
            const apiKey = req.headers['x-internal-key'];
            if (!apiKey || apiKey !== process.env.INTERNAL_API_KEY) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const { jiraAccountId, sections, reportType } = req.body || {};
            if (!jiraAccountId || !Array.isArray(sections)) {
                return res.status(400).json({ error: 'Bad Request: missing jiraAccountId or sections' });
            }

            const mapping = await getMappingByJiraAccountId(jiraAccountId);
            if (!mapping) {
                return res.status(404).json({ error: 'No mapping found for Jira account ID' });
            }

            const isMorningReport = reportType === 'Morning' || (
                sections.length === 2 &&
                sections.some(s => s.status === 'To Do') &&
                sections.some(s => s.status === 'In Progress')
            );

            if (isMorningReport) {
                let allIssues = [];
                for (const sec of sections) {
                    const issues = await jiraClient.getIssuesByAssigneeAndStatus(jiraAccountId, sec.status);
                    if (Array.isArray(issues)) {
                        allIssues.push(...issues);
                    }
                }

                const totalCount = allIssues.length;
                res.setHeader('X-Total-Count', totalCount.toString());
                if (totalCount === 0) {
                    return res.json({ totalCount: 0 });
                }

                const pdfBuffer = await generateMorningCronReport(allIssues, mapping);
                res.setHeader('Content-Type', 'application/pdf');
                return res.send(pdfBuffer);
            }

            const sectionData = [];
            let totalCount = 0;

            for (const sec of sections) {
                let issues = await jiraClient.getIssuesByAssigneeAndStatus(jiraAccountId, sec.status);

                if (sec.dateFilter && Array.isArray(issues)) {
                    const field = sec.dateFilter.field;
                    const fromStr = sec.dateFilter.from;
                    const toStr = sec.dateFilter.to;

                    issues = issues.filter(issue => {
                        const val = issue.fields?.[field];
                        if (!val) return false;
                        const dateOnly = val.substring(0, 10);
                        if (fromStr && dateOnly < fromStr) return false;
                        if (toStr && dateOnly > toStr) return false;
                        return true;
                    });
                }

                const issueList = issues || [];
                totalCount += issueList.length;

                // Keep original status intact for rendering if not done today
                let renderStatus = sec.status;
                if (sec.status === 'Done' && sec.dateFilter) {
                    renderStatus = 'Done (Today)';
                }

                sectionData.push({ status: renderStatus, issues: issueList });
            }

            res.setHeader('X-Total-Count', totalCount.toString());
            if (totalCount === 0) {
                return res.json({ totalCount: 0 });
            }

            const isEveningReport = reportType === 'Evening' || (
                sections.length === 1 && sections[0].status === 'Done'
            );

            let pdfBuffer;
            if (isEveningReport) {
                const today = new Date().toISOString().slice(0, 10);
                pdfBuffer = await generateTaskReport(sectionData[0].issues, 'Done', mapping, { startDate: today, endDate: today });
            } else {
                pdfBuffer = await generateMultiSectionReport(sectionData, mapping);
            }

            res.setHeader('Content-Type', 'application/pdf');
            res.send(pdfBuffer);
            
        } catch (error) {
            console.error('Error generating internal report:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    app.post('/webhook/jira', async (req, res) => {
        try {
            console.log('Received Jira webhook payload (event:', req.body.issue_event_type_name, ')');

            if (req.body.issue_event_type_name === 'issue_assigned') {
                const assigneeItem = req.body.changelog?.items?.find(item => item.field === 'assignee');

                if (assigneeItem && (assigneeItem.from || assigneeItem.to)) {
                    const issueKey = req.body.issue?.key;
                    const issueFields = await enrichIssueFields(issueKey, req.body.issue?.fields);

                    const baseUrl = (process.env.JIRA_BASE_URL || '').replace(/\/+$/, '');
                    const issueUrl = baseUrl && issueKey ? `${baseUrl}/browse/${issueKey}` : '';
                    const projectName = issueFields?.project?.name || 'Unknown Project';
                    const summary = issueFields?.summary || 'No summary';
                    const priorityName = issueFields?.priority?.name || 'None';
                    const dueDate = issueFields?.duedate;
                    const actorName = req.body.user?.displayName || 'Unknown';
                    const today = getTodayDateString();

                    const priorityAndDueText = formatPriorityAndDue(priorityName, dueDate, {
                        withPriorityLabel: true,
                        alwaysShowDueDate: true,
                        today
                    });

                    const formattedKey = issueUrl ? `[${issueKey}](${issueUrl})` : (issueKey || '');

                    // 1. Handle unassignment if previous assignee existed (and is different from new assignee)
                    if (assigneeItem.from && assigneeItem.from !== assigneeItem.to) {
                        const prevAssigneeAccountId = assigneeItem.from;
                        const mapping = await getMappingByJiraAccountId(prevAssigneeAccountId);

                        if (mapping && mapping.chat_id) {
                            const message =
                                `🔕 អ្នកត្រូវបានដកចេញពីកិច្ចការ!\n\n` +
                                `🗂 ${escapeMarkdown(projectName)}\n\n` +
                                `ដកចេញដោយ: ${escapeMarkdown(actorName)}\n\n` +
                                `${formattedKey}: ${escapeMarkdown(summary)}\n\n` +
                                `${priorityAndDueText}`;

                            const plainMessage =
                                `🔕 អ្នកត្រូវបានដកចេញពីកិច្ចការ!\n\n` +
                                `🗂 ${projectName}\n\n` +
                                `ដកចេញដោយ: ${actorName}\n\n` +
                                `${issueKey}: ${summary}\n\n` +
                                `${priorityAndDueText.replace(' ⚠️ ផុតកំណត់', ' (ផុតកំណត់)')}`;

                            await sendNotification(bot, mapping.chat_id, message, plainMessage, `unassignment notification for ${issueKey}`);
                        } else {
                            console.log(`No Telegram mapping found for Jira account ${prevAssigneeAccountId}`);
                        }
                    }

                    // 2. Handle assignment if new assignee is assigned (and is different from previous assignee)
                    if (assigneeItem.to && assigneeItem.to !== assigneeItem.from) {
                        const newAssigneeAccountId = assigneeItem.to;
                        const mapping = await getMappingByJiraAccountId(newAssigneeAccountId);

                        if (mapping && mapping.chat_id) {
                            const message =
                                `🔔 អ្នកត្រូវបានចាត់តាំងកិច្ចការថ្មី!\n\n` +
                                `🗂 ${escapeMarkdown(projectName)}\n\n` +
                                `ចាត់តាំងដោយ: ${escapeMarkdown(actorName)}\n\n` +
                                `${formattedKey}: ${escapeMarkdown(summary)}\n\n` +
                                `${priorityAndDueText}`;

                            const plainMessage =
                                `🔔 អ្នកត្រូវបានចាត់តាំងកិច្ចការថ្មី!\n\n` +
                                `🗂 ${projectName}\n\n` +
                                `ចាត់តាំងដោយ: ${actorName}\n\n` +
                                `${issueKey}: ${summary}\n\n` +
                                `${priorityAndDueText.replace(' ⚠️ ផុតកំណត់', ' (ផុតកំណត់)')}`;

                            await sendNotification(bot, mapping.chat_id, message, plainMessage, `assignment notification for ${issueKey}`);
                        } else {
                            console.log(`No Telegram mapping found for Jira account ${newAssigneeAccountId}`);
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Error processing webhook:', err);
        } finally {
            // Always respond 200 so Jira doesn't retry unnecessarily
            res.status(200).send('OK');
        }
    });

    app.listen(port, () => {
        console.log(`Express webhook server listening on port ${port}`);
    });

    return app;
}

module.exports = {
    startWebhookServer
};
