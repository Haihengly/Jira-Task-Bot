const express = require('express');
const { getMappingByJiraAccountId } = require('./db/mappings');
const jiraClient = require('./jira/client');
const { getTodayDateString, formatPriorityAndDue, escapeMarkdown } = require('./utils');

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
