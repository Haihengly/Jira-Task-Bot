const express = require('express');
const crypto = require('crypto');
const { getMappingByJiraAccountId } = require('../db/mappings');
const jiraClient = require('../jira/client');
const { getTodayDateString } = require('../utils');
const { generateMorningCronReport, generateTaskReport } = require('../pdf/generateTaskReport');

function createInternalReportRouter() {
    const router = express.Router();

    router.post('/internal/generate-report', async (req, res) => {
        try {
            const apiKey = req.headers['x-internal-key'];
            const expectedKey = process.env.INTERNAL_API_KEY;

            if (!apiKey || !expectedKey) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const apiKeyBuf = Buffer.from(apiKey);
            const expectedKeyBuf = Buffer.from(expectedKey);

            if (apiKeyBuf.length !== expectedKeyBuf.length) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            if (!crypto.timingSafeEqual(apiKeyBuf, expectedKeyBuf)) {
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
                const sectionIssues = await Promise.all(
                    sections.map(sec => jiraClient.getIssuesByAssigneeAndStatus(jiraAccountId, sec.status))
                );
                const allIssues = sectionIssues.flat().filter(Boolean);

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
                let additionalJql = '';
                if (sec.dateFilter) {
                    if (sec.dateFilter.from) additionalJql += ` AND ${sec.dateFilter.field} >= "${sec.dateFilter.from}"`;
                    if (sec.dateFilter.to) additionalJql += ` AND ${sec.dateFilter.field} <= "${sec.dateFilter.to} 23:59"`;
                }

                let issues = await jiraClient.getIssuesByAssigneeAndStatus(jiraAccountId, sec.status, undefined, additionalJql);

                if (sec.dateFilter && Array.isArray(issues)) {
                    const field = sec.dateFilter.field;
                    const fromStr = sec.dateFilter.from;
                    const toStr = sec.dateFilter.to;

                    const countBefore = issues.length;

                    issues = issues.filter(issue => {
                        const val = issue.fields?.[field];
                        if (!val) return false;
                        const d = new Date(val);
                        const dateOnly = isNaN(d.getTime())
                            ? val.substring(0, 10)
                            : d.toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' });
                        if (fromStr && dateOnly < fromStr) return false;
                        if (toStr && dateOnly > toStr) return false;
                        return true;
                    });

                    console.log(`[Internal Report] ${sec.status} date filter (from: ${fromStr}, to: ${toStr}): fetched ${countBefore}, kept ${issues.length}`);
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

            const today = getTodayDateString();
            const pdfBuffer = await generateTaskReport(sectionData[0].issues, 'Done', mapping, { startDate: today, endDate: today });

            res.setHeader('Content-Type', 'application/pdf');
            res.send(pdfBuffer);

        } catch (error) {
            console.error('Error generating internal report:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    return router;
}

module.exports = {
    createInternalReportRouter
};
