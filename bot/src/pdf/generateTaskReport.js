const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { getKhmerPriority, getTodayDateString, getIssueTypeLabel, sortIssuesByUrgency } = require('../utils');

const dividerPath = path.join(__dirname, 'assets', 'divider.png');
const dividerBase64 = fs.existsSync(dividerPath)
    ? fs.readFileSync(dividerPath).toString('base64')
    : '';
const dividerDataUri = `data:image/png;base64,${dividerBase64}`;

/**
 * Convert ASCII digits (0-9) to Khmer numerals (០-៩)
 * @param {string|number} value
 * @returns {string}
 */
function toKhmerDigits(value) {
    if (value === null || value === undefined) return '';
    const khmerDigits = ['០', '១', '២', '៣', '៤', '៥', '៦', '៧', '៨', '៩'];
    return String(value).replace(/\d/g, (digit) => khmerDigits[parseInt(digit, 10)]);
}

/**
 * Escape HTML special characters
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

const KHMER_MONTH_NAMES = [
    'មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា',
    'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'
];

/**
 * Format dynamic Khmer date description text with Khmer month names.
 * @param {Date|string} [startDate]
 * @param {Date|string} [endDate]
 * @returns {string}
 */
function formatKhmerDateText(startDate = new Date(), endDate = null) {
    const parse = (d) => {
        if (!d) return null;
        const date = new Date(d);
        if (isNaN(date.getTime())) return null;
        const day = date.toLocaleDateString('en-GB', { timeZone: 'Asia/Phnom_Penh', day: '2-digit' });
        const monthNum = parseInt(date.toLocaleDateString('en-GB', { timeZone: 'Asia/Phnom_Penh', month: 'numeric' }), 10);
        const year = date.toLocaleDateString('en-GB', { timeZone: 'Asia/Phnom_Penh', year: 'numeric' });
        const monthName = (monthNum >= 1 && monthNum <= 12) ? KHMER_MONTH_NAMES[monthNum - 1] : monthNum;
        return { day, monthName, year };
    };

    const start = parse(startDate) || parse(new Date());
    if (endDate) {
        const end = parse(endDate);
        if (end && (start.day !== end.day || start.monthName !== end.monthName || start.year !== end.year)) {
            return `ចាប់ពីថ្ងៃទី ${toKhmerDigits(start.day)} ខែ ${start.monthName} ឆ្នាំ ${toKhmerDigits(start.year)} ដល់ថ្ងៃទី ${toKhmerDigits(end.day)} ខែ ${end.monthName} ឆ្នាំ ${toKhmerDigits(end.year)}`;
        }
    }
    return `ថ្ងៃទី ${toKhmerDigits(start.day)} ខែ ${start.monthName} ឆ្នាំ ${toKhmerDigits(start.year)}`;
}

/**
 * Format priority with Khmer label and color using shared utils
 * @param {string} priorityName
 * @returns {string}
 */
function getPriorityBadge(priorityName) {
    if (!priorityName) {
        return `<span style="color: #94a3b8;">គ្មាន</span>`;
    }
    const { label } = getKhmerPriority(priorityName);
    if (label === 'គ្មាន') {
        return `<span style="color: #94a3b8;">គ្មាន</span>`;
    }
    const colorMap = {
        'ខ្ពស់បំផុត': '#dc2626',
        'ខ្ពស់': '#ea580c',
        'មធ្យម': '#d97706',
        'ទាប': '#2563eb',
        'ទាបបំផុត': '#6b7280'
    };
    const color = colorMap[label] || '#475569';
    return `<span style="color: ${color}; font-weight: 600;">${escapeHtml(label)}</span>`;
}

/**
 * Format category / issue type with Khmer mapping
 * @param {Object|string} issueType
 * @returns {string}
 */
function getCategoryLabel(issueType) {
    const label = getIssueTypeLabel(issueType, { fallback: null, checkSubtaskFlag: false });
    if (!label) {
        return `<span style="color: #94a3b8;">គ្មាន</span>`;
    }
    return `<span>${escapeHtml(label)}</span>`;
}

/**
 * Format status with Khmer label and color badge
 * @param {Object|string} status
 * @returns {string}
 */
function getStatusBadge(status) {
    if (!status) {
        return `<span style="color: #94a3b8;">គ្មាន</span>`;
    }
    const statusName = typeof status === 'string' ? status : status.name;
    if (!statusName) {
        return `<span style="color: #94a3b8;">គ្មាន</span>`;
    }

    const map = {
        'To Do': 'ត្រូវធ្វើ',
        'In Progress': 'កំពុងធ្វើ',
        'Done': 'បានធ្វើរួច'
    };

    const label = map[statusName] || statusName;
    const colorMap = {
        'To Do': '#2563eb',
        'In Progress': '#d97706',
        'Done': '#16a34a'
    };
    const color = colorMap[statusName] || '#475569';
    return `<span style="color: ${color}; font-weight: 600;">${escapeHtml(label)}</span>`;
}

/**
 * Format standard text value, showing "គ្មាន" if empty
 * @param {string} value
 * @returns {string}
 */
function formatText(value) {
    if (!value || typeof value !== 'string' || value.trim() === '') {
        return `<span style="color: #94a3b8;">គ្មាន</span>`;
    }
    return `<span>${escapeHtml(value)}</span>`;
}

/**
 * Format date string (YYYY-MM-DD), showing "គ្មាន" if empty
 * @param {string|Date} dateStr
 * @returns {string}
 */
function formatDate(dateStr) {
    if (!dateStr) {
        return `<span style="color: #94a3b8;">គ្មាន</span>`;
    }
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) {
            return `<span>${escapeHtml(dateStr)}</span>`;
        }
        const formatted = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' });
        return `<span>${escapeHtml(formatted)}</span>`;
    } catch {
        return `<span>${escapeHtml(dateStr)}</span>`;
    }
}

/**
 * Format due date with overdue indicator, showing "គ្មាន" if empty
 * @param {string} dueDate
 * @param {boolean} isDone
 * @returns {string}
 */
function formatDueDate(dueDate, isDone) {
    if (!dueDate) {
        return `<span style="color: #94a3b8;">គ្មាន</span>`;
    }
    const today = getTodayDateString();
    const isOverdue = !isDone && dueDate < today;
    if (isOverdue) {
        return `<span style="color: #dc2626; font-weight: 600; background: #fee2e2; padding: 2px 4px; border-radius: 4px; display: inline-block;">⚠️ ហួសកំណត់ (${escapeHtml(dueDate)})</span>`;
    }
    return `<span>${escapeHtml(dueDate)}</span>`;
}

const REPORT_CSS = `
        @import url('https://fonts.googleapis.com/css2?family=Moul&family=Noto+Sans+Khmer:wght@400;500;600;700&display=swap');

        * {
            box-sizing: border-box;
        }

        body {
            font-family: 'Noto Sans Khmer', 'Khmer OS', 'Segoe UI', Arial, sans-serif;
            font-size: 12px;
            line-height: 1.4;
            color: #1e293b;
            padding: 24px;
            margin: 0;
            background: #ffffff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }

        .header {
            border-bottom: 2px solid #3b82f6;
            padding-bottom: 8px;
            margin-bottom: 16px;
        }

        .letterhead {
            margin-bottom: 12px;
            font-family: 'Noto Sans Khmer', sans-serif;
        }

        .lh-kingdom {
            text-align: center;
            margin-bottom: 8px;
        }

        .lh-country {
            font-family: 'Moul', cursive;
            font-size: 16px;
            font-weight: normal;
            color: #0f172a;
        }

        .lh-motto {
            font-family: 'Moul', cursive;
            font-size: 14px;
            font-weight: normal;
            margin-top: 2px;
            color: #0f172a;
        }

        .lh-ministry-block {
            text-align: left;
        }

        .lh-ministry {
            font-family: 'Moul', cursive;
            font-size: 14px;
            font-weight: normal;
            color: #0f172a;
        }

        .lh-dept {
            font-size: 12.5px;
            font-weight: 500;
            margin-top: 2px;
            color: #334155;
        }

        .lh-office {
            font-size: 12.5px;
            font-weight: 500;
            margin-top: 2px;
            color: #334155;
        }

        .title-block {
            text-align: center;
            margin-bottom: 16px;
        }

        .title-block h1 {
            font-family: 'Moul', cursive;
            font-size: 18px;
            font-weight: normal;
            margin: 0 0 4px 0;
            color: #0f172a;
        }

        .date-line {
            font-size: 13px;
            font-weight: 500;
            color: #475569;
        }

        .meta-box {
            display: flex;
            flex-direction: column;
            gap: 6px;
            font-size: 12.5px;
            color: #475569;
            background: #f8fafc;
            padding: 10px 16px;
            border-radius: 6px;
            border: 1px solid #e2e8f0;
        }

        .meta-item {
            display: flex;
            align-items: center;
        }

        .meta-label {
            font-weight: 600;
            width: 120px;
            color: #334155;
        }

        .meta-value {
            flex: 1;
        }

        .project-section {
            margin-bottom: 24px;
        }

        .project-title {
            font-size: 14px;
            font-weight: 700;
            background: #f1f5f9;
            color: #0f172a;
            padding: 6px 10px;
            border-radius: 4px;
            margin-bottom: 10px;
            border-left: 4px solid #3b82f6;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
            table-layout: fixed;
        }

        thead {
            display: table-header-group;
        }

        tr {
            page-break-inside: avoid;
            break-inside: avoid;
        }

        th {
            background-color: #f8fafc;
            color: #334155;
            font-weight: 600;
            text-align: left;
            padding: 6px 6px;
            border-top: 1px solid #e2e8f0;
            border-bottom: 2px solid #cbd5e1;
            white-space: nowrap;
            vertical-align: bottom;
        }

        .en-header {
            display: block;
            font-size: 9px;
            font-weight: 500;
            color: #64748b;
            margin-top: 2px;
        }

        td {
            padding: 7px 6px;
            border-bottom: 1px solid #e2e8f0;
            vertical-align: top;
            word-wrap: break-word;
            overflow-wrap: break-word;
        }

        tr:nth-child(even) {
            background-color: #fafbfc;
        }

        .col-num {
            width: 36px;
            text-align: center;
        }

        th.col-num {
            text-align: center;
        }

        .col-title {
            width: auto;
        }

        .col-status {
            width: 90px;
        }

        .col-category {
            width: 90px;
        }

        .col-priority {
            width: 85px;
        }

        .col-req-date {
            width: 95px;
        }

        .col-req-by {
            width: 105px;
        }

        .col-handle-by {
            width: 110px;
        }

        .col-due {
            width: 95px;
        }

        .col-resolved {
            width: 95px;
        }

        .issue-link {
            color: #1e293b;
            text-decoration: none;
            font-weight: 500;
        }

        .issue-link:hover {
            text-decoration: underline;
        }

        .subtask-row {
            background-color: #f8fafc !important;
        }

        .subtask-indent {
            padding-left: 14px;
            color: #475569;
        }

        .subtask-arrow {
            color: #94a3b8;
            font-weight: bold;
            margin-right: 4px;
        }

        .footer {
            margin-top: 30px;
            padding-top: 10px;
            border-top: 1px solid #e2e8f0;
            font-size: 11px;
            color: #64748b;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
`;

/**
 * Identify subtasks to deduplicate from top-level rendering and index issues by key.
 * @param {Array} issues
 * @returns {{ topLevelIssues: Array, issuesByKey: Map }}
 */
function deduplicateAndIndexIssues(issues) {
    const subtaskKeys = new Set();
    issues.forEach(issue => {
        (issue.fields?.subtasks || []).forEach(st => {
            if (st.key) subtaskKeys.add(st.key);
        });
    });

    const issuesByKey = new Map();
    issues.forEach(issue => {
        if (issue.key) issuesByKey.set(issue.key, issue);
    });

    const topLevelIssues = issues.filter(issue => !subtaskKeys.has(issue.key));
    return { topLevelIssues, issuesByKey };
}

/**
 * Build the complete report HTML document with shared letterhead, meta box, and footer.
 * @param {Object} params
 * @param {string} params.title Report title
 * @param {string} params.dateLine Formatted Khmer date line
 * @param {Array<{ label: string, valueHtml: string }>} params.metaRows Meta box rows
 * @param {string} params.bodyHtml Main report body HTML
 * @param {number} params.totalCount Total issue count for the footer
 * @returns {string}
 */
function buildReportHtml({ title, dateLine, metaRows, bodyHtml, totalCount }) {
    const metaItemsHtml = metaRows.map(row => `
            <div class="meta-item">
                <span class="meta-label">${escapeHtml(row.label)}</span>
                <span class="meta-value">${row.valueHtml}</span>
            </div>`).join('');

    return `
<!DOCTYPE html>
<html lang="km">
<head>
    <meta charset="UTF-8">
    <title>${escapeHtml(title)}</title>
    <style>${REPORT_CSS}    </style>
</head>
<body>
    <div class="header">
        <div class="letterhead">
            <div class="lh-kingdom">
                <div class="lh-country">ព្រះរាជាណាចក្រកម្ពុជា</div>
                <div class="lh-motto">ជាតិ សាសនា ព្រះមហាក្សត្រ</div>
                <img src="${dividerDataUri}" style="width: 190px; height: auto; display: block; margin: 4px auto 0; opacity: 0.75;" />
            </div>
            <div class="lh-ministry-block">
                <div class="lh-ministry">ក្រសួងសាធារណការ និងដឹកជញ្ជូន</div>
                <div class="lh-dept">អគ្គនាយកដ្ឋានបច្ចេកវិទ្យា និងទំនាក់ទំនងសាធារណៈ</div>
                <div class="lh-office">នាយកដ្ឋានប្រព័ន្ធបច្ចេកវិទ្យា</div>
            </div>
        </div>

        <div class="title-block">
            <h1>${escapeHtml(title)}</h1>
            <div class="date-line">${escapeHtml(dateLine)}</div>
        </div>

        <div class="meta-box">${metaItemsHtml}
        </div>
    </div>

    ${bodyHtml}

    <div class="footer">
        <span>ចំនួនកិច្ចការសរុប: <strong>${totalCount}</strong></span>
        <span>បង្កើតដោយ Jira Task Bot</span>
    </div>
</body>
</html>
`;
}

/**
 * Launch Puppeteer and render an HTML string into a landscape A4 PDF buffer.
 * @param {string} html
 * @returns {Promise<Buffer>}
 */
async function renderPdfFromHtml(html) {
    const browser = await puppeteer.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--font-render-hinting=none'
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setContent(html, {
            waitUntil: ['load', 'domcontentloaded', 'networkidle0'],
            timeout: 30000
        });

        const pdfResult = await page.pdf({
            format: 'A4',
            landscape: true,
            printBackground: true,
            margin: {
                top: '15mm',
                bottom: '15mm',
                left: '12mm',
                right: '12mm'
            }
        });

        return Buffer.from(pdfResult);
    } finally {
        await browser.close();
    }
}

/**
 * Generate a PDF report for a list of Jira tasks.
 * @param {Array} issues Jira issues
 * @param {string} status 'To Do', 'In Progress', 'Done'
 * @param {Object} userMapping
 * @param {Object} [options={}] { startDate, endDate }
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generateTaskReport(issues, status, userMapping, options = {}) {
    const baseUrl = process.env.JIRA_BASE_URL ? process.env.JIRA_BASE_URL.replace(/\/+$/, '') : '';
    const displayName = userMapping.display_name || userMapping.jira_email || 'Staff';
    const email = userMapping.jira_email || '';
    const isDone = status === 'Done';
    const today = getTodayDateString();

    const { topLevelIssues, issuesByKey } = deduplicateAndIndexIssues(issues);

    const now = new Date();
    const khmerDateLine = formatKhmerDateText(options.startDate || now, options.endDate);

    let headerStatus = status;
    if (status === 'To Do') headerStatus = 'ត្រូវធ្វើ';
    else if (status === 'In Progress') headerStatus = 'កំពុងធ្វើ';
    else if (status === 'Done') headerStatus = 'បានធ្វើរួច';

    // Group top-level issues by project
    const groupedIssues = {};
    topLevelIssues.forEach(issue => {
        const projectName = issue.fields?.project?.name || 'Unknown Project';
        if (!groupedIssues[projectName]) {
            groupedIssues[projectName] = [];
        }
        groupedIssues[projectName].push(issue);
    });

    const projectNames = Object.keys(groupedIssues).sort((a, b) => a.localeCompare(b));

    // Sort issues within each project group by urgency
    projectNames.forEach(proj => {
        const projectIssues = groupedIssues[proj];
        if (isDone) {
            projectIssues.sort((a, b) => (a.key || '').localeCompare(b.key || ''));
        } else {
            sortIssuesByUrgency(projectIssues, today);
        }
    });

    const bodyHtml = projectNames.map(proj => `
        <div class="project-section">
            <div class="project-title">${escapeHtml(proj)}</div>
            <table>
                <thead>
                    <tr>
                        <th class="col-num">ល.រ<span class="en-header">No</span></th>
                        <th class="col-title">ចំណងជើង<span class="en-header">Title</span></th>
                        <th class="col-category">ប្រភេទ<span class="en-header">Category</span></th>
                        <th class="col-priority">អាទិភាព<span class="en-header">Priority</span></th>
                        <th class="col-req-date">ថ្ងៃស្នើសុំ<span class="en-header">Request Date</span></th>
                        <th class="col-req-by">អ្នកស្នើសុំ<span class="en-header">Request By</span></th>
                        <th class="col-handle-by">អ្នកទទួលបន្ទុក<span class="en-header">Handle By</span></th>
                        <th class="col-due">ថ្ងៃកំណត់<span class="en-header">Due Date</span></th>
                        ${isDone ? '<th class="col-resolved">ថ្ងៃបញ្ចប់<span class="en-header">Resolved Date</span></th>' : ''}
                    </tr>
                </thead>
                <tbody>
                    ${groupedIssues[proj].map((issue, idx) => {
                        const issueKey = issue.key || '';
                        const summary = issue.fields?.summary || 'No summary';
                        const issueUrl = baseUrl ? `${baseUrl}/browse/${issueKey}` : '#';
                        const issueType = issue.fields?.issuetype;
                        const priorityName = issue.fields?.priority?.name;
                        const created = issue.fields?.created;
                        const reporter = issue.fields?.reporter?.displayName;
                        const assignee = issue.fields?.assignee?.displayName;
                        const dueDate = issue.fields?.duedate;
                        const resolutiondate = issue.fields?.resolutiondate;
                        const subtasks = issue.fields?.subtasks || [];

                        let rows = `
                            <tr>
                                <td class="col-num">${idx + 1}</td>
                                <td class="col-title">
                                    <a class="issue-link" href="${issueUrl}">${escapeHtml(summary)}</a>
                                </td>
                                <td class="col-category">${getCategoryLabel(issueType)}</td>
                                <td class="col-priority">${getPriorityBadge(priorityName)}</td>
                                <td class="col-req-date">${formatDate(created)}</td>
                                <td class="col-req-by">${formatText(reporter)}</td>
                                <td class="col-handle-by">${formatText(assignee)}</td>
                                <td class="col-due">${formatDueDate(dueDate, isDone)}</td>
                                ${isDone ? `<td class="col-resolved">${formatDate(resolutiondate)}</td>` : ''}
                            </tr>
                        `;

                        if (subtasks && subtasks.length > 0) {
                            subtasks.forEach(subtask => {
                                const subKey = subtask.key || '';
                                const fullSubIssue = issuesByKey.get(subKey);
                                const subSummary = subtask.fields?.summary || fullSubIssue?.fields?.summary || 'No summary';
                                const subUrl = baseUrl ? `${baseUrl}/browse/${subKey}` : '#';
                                const subIssueType = subtask.fields?.issuetype || fullSubIssue?.fields?.issuetype || 'Sub-task';
                                const subPriority = subtask.fields?.priority?.name || fullSubIssue?.fields?.priority?.name;
                                const subCreated = subtask.fields?.created || fullSubIssue?.fields?.created;
                                const subReporter = subtask.fields?.reporter?.displayName || fullSubIssue?.fields?.reporter?.displayName;
                                const subAssignee = subtask.fields?.assignee?.displayName || fullSubIssue?.fields?.assignee?.displayName;
                                const subDueDate = subtask.fields?.duedate || fullSubIssue?.fields?.duedate;
                                const subResolutiondate = subtask.fields?.resolutiondate || fullSubIssue?.fields?.resolutiondate;

                                rows += `
                                    <tr class="subtask-row">
                                        <td class="col-num"></td>
                                        <td class="col-title subtask-indent">
                                            <span class="subtask-arrow">↳</span>
                                            <a class="issue-link" href="${subUrl}">${escapeHtml(subSummary)}</a>
                                        </td>
                                        <td class="col-category">${getCategoryLabel(subIssueType)}</td>
                                        <td class="col-priority">${getPriorityBadge(subPriority)}</td>
                                        <td class="col-req-date">${formatDate(subCreated)}</td>
                                        <td class="col-req-by">${formatText(subReporter)}</td>
                                        <td class="col-handle-by">${formatText(subAssignee)}</td>
                                        <td class="col-due">${formatDueDate(subDueDate, isDone)}</td>
                                        ${isDone ? `<td class="col-resolved">${formatDate(subResolutiondate)}</td>` : ''}
                                    </tr>
                                `;
                            });
                        }

                        return rows;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `).join('');

    const html = buildReportHtml({
        title: 'របាយការណ៍កិច្ចការ',
        dateLine: khmerDateLine,
        metaRows: [
            {
                label: 'អ្នកទទួលបន្ទុក:',
                valueHtml: `<strong>${escapeHtml(displayName)}</strong> ${email ? `(${escapeHtml(email)})` : ''}`
            },
            {
                label: 'ស្ថានភាព:',
                valueHtml: `<strong>${escapeHtml(headerStatus)}</strong>`
            },
            {
                label: 'ចំនួនកិច្ចការ:',
                valueHtml: `<strong>${issues.length}</strong> កិច្ចការ`
            }
        ],
        bodyHtml,
        totalCount: issues.length
    });

    return renderPdfFromHtml(html);
}

/**
 * Generate a PDF report combining multiple statuses into one unified table (used by Morning Cron and "All" export).
 * @param {Array} issues Jira issues
 * @param {Object} userMapping
 * @param {Object} [options={}] { startDate, endDate, title, statusLabel, includeResolvedDate }
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generateMorningCronReport(issues, userMapping, options = {}) {
    const baseUrl = process.env.JIRA_BASE_URL ? process.env.JIRA_BASE_URL.replace(/\/+$/, '') : '';
    const displayName = userMapping.display_name || userMapping.jira_email || 'Staff';
    const email = userMapping.jira_email || '';
    const today = getTodayDateString();
    const reportTitle = options.title || 'របាយការណ៍កិច្ចការប្រចាំថ្ងៃ';
    const statusLabel = options.statusLabel || 'ត្រូវធ្វើ និង កំពុងធ្វើ';
    const includeResolvedDate = Boolean(options.includeResolvedDate);

    const { topLevelIssues, issuesByKey } = deduplicateAndIndexIssues(issues);

    const now = new Date();
    const khmerDateLine = formatKhmerDateText(options.startDate || now, options.endDate);

    const getStatusName = (issue) => {
        const s = issue.fields?.status;
        if (!s) return '';
        return typeof s === 'string' ? s : s.name || '';
    };

    const inProgressIssues = topLevelIssues.filter(issue => getStatusName(issue) === 'In Progress');
    const toDoIssues = topLevelIssues.filter(issue => getStatusName(issue) === 'To Do');
    const doneIssues = topLevelIssues.filter(issue => getStatusName(issue) === 'Done');
    const otherIssues = topLevelIssues.filter(issue => {
        const name = getStatusName(issue);
        return name !== 'In Progress' && name !== 'To Do' && name !== 'Done';
    });

    const sortByResolutionDate = (list) => {
        list.sort((a, b) => {
            const resA = a.fields?.resolutiondate;
            const resB = b.fields?.resolutiondate;

            if (resA && !resB) return -1;
            if (!resA && resB) return 1;

            if (resA && resB) {
                const timeA = Date.parse(resA);
                const timeB = Date.parse(resB);
                if (!isNaN(timeA) && !isNaN(timeB) && timeA !== timeB) {
                    return timeB - timeA;
                }
                if (resA !== resB) {
                    return resB.localeCompare(resA);
                }
            }

            return (a.key || '').localeCompare(b.key || '');
        });
    };

    sortIssuesByUrgency(inProgressIssues, today);
    sortIssuesByUrgency(toDoIssues, today);
    sortByResolutionDate(doneIssues);
    sortIssuesByUrgency(otherIssues, today);

    const sortedIssues = [...inProgressIssues, ...toDoIssues, ...doneIssues, ...otherIssues];

    const bodyHtml = sortedIssues.length === 0
        ? `<div style="text-align: center; padding: 40px; color: #64748b; font-size: 14px; background: #f8fafc; border-radius: 6px; border: 1px dashed #cbd5e1; margin-top: 20px;">មិនមានកិច្ចការត្រូវធ្វើ ឬកំពុងធ្វើនោះទេ</div>`
        : `
        <table>
            <thead>
                <tr>
                    <th class="col-num">ល.រ<span class="en-header">No</span></th>
                    <th class="col-title">ចំណងជើង<span class="en-header">Title</span></th>
                    <th class="col-status">ស្ថានភាព<span class="en-header">Status</span></th>
                    <th class="col-category">ប្រភេទ<span class="en-header">Category</span></th>
                    <th class="col-priority">អាទិភាព<span class="en-header">Priority</span></th>
                    <th class="col-req-date">ថ្ងៃស្នើសុំ<span class="en-header">Request Date</span></th>
                    <th class="col-req-by">អ្នកស្នើសុំ<span class="en-header">Request By</span></th>
                    <th class="col-handle-by">អ្នកទទួលបន្ទុក<span class="en-header">Handle By</span></th>
                    <th class="col-due">ថ្ងៃកំណត់<span class="en-header">Due Date</span></th>
                    ${includeResolvedDate ? '<th class="col-resolved">ថ្ងៃបញ្ចប់<span class="en-header">Resolved Date</span></th>' : ''}
                </tr>
            </thead>
            <tbody>
                ${sortedIssues.map((issue, idx) => {
                    const issueKey = issue.key || '';
                    const summary = issue.fields?.summary || 'No summary';
                    const issueUrl = baseUrl ? `${baseUrl}/browse/${issueKey}` : '#';
                    const statusObj = issue.fields?.status;
                    const isRowDone = getStatusName(issue) === 'Done';
                    const issueType = issue.fields?.issuetype;
                    const priorityName = issue.fields?.priority?.name;
                    const created = issue.fields?.created;
                    const reporter = issue.fields?.reporter?.displayName;
                    const assignee = issue.fields?.assignee?.displayName;
                    const dueDate = issue.fields?.duedate;
                    const resolutiondate = issue.fields?.resolutiondate;
                    const subtasks = issue.fields?.subtasks || [];

                    let rows = `
                        <tr>
                            <td class="col-num">${idx + 1}</td>
                            <td class="col-title">
                                <a class="issue-link" href="${issueUrl}">${escapeHtml(summary)}</a>
                            </td>
                            <td class="col-status">${getStatusBadge(statusObj)}</td>
                            <td class="col-category">${getCategoryLabel(issueType)}</td>
                            <td class="col-priority">${getPriorityBadge(priorityName)}</td>
                            <td class="col-req-date">${formatDate(created)}</td>
                            <td class="col-req-by">${formatText(reporter)}</td>
                            <td class="col-handle-by">${formatText(assignee)}</td>
                            <td class="col-due">${formatDueDate(dueDate, isRowDone)}</td>
                            ${includeResolvedDate ? `<td class="col-resolved">${isRowDone ? formatDate(resolutiondate) : formatDate(null)}</td>` : ''}
                        </tr>
                    `;

                    if (subtasks && subtasks.length > 0) {
                        subtasks.forEach(subtask => {
                            const subKey = subtask.key || '';
                            const fullSubIssue = issuesByKey.get(subKey);
                            const subSummary = subtask.fields?.summary || fullSubIssue?.fields?.summary || 'No summary';
                            const subUrl = baseUrl ? `${baseUrl}/browse/${subKey}` : '#';
                            const subStatus = subtask.fields?.status || fullSubIssue?.fields?.status;
                            const subStatusName = typeof subStatus === 'string' ? subStatus : (subStatus?.name || '');
                            const isSubDone = subStatusName === 'Done';
                            const subIssueType = subtask.fields?.issuetype || fullSubIssue?.fields?.issuetype || 'Sub-task';
                            const subPriority = subtask.fields?.priority?.name || fullSubIssue?.fields?.priority?.name;
                            const subCreated = subtask.fields?.created || fullSubIssue?.fields?.created;
                            const subReporter = subtask.fields?.reporter?.displayName || fullSubIssue?.fields?.reporter?.displayName;
                            const subAssignee = subtask.fields?.assignee?.displayName || fullSubIssue?.fields?.assignee?.displayName;
                            const subDueDate = subtask.fields?.duedate || fullSubIssue?.fields?.duedate;
                            const subResolutiondate = subtask.fields?.resolutiondate || fullSubIssue?.fields?.resolutiondate;

                            rows += `
                                <tr class="subtask-row">
                                    <td class="col-num"></td>
                                    <td class="col-title subtask-indent">
                                        <span class="subtask-arrow">↳</span>
                                        <a class="issue-link" href="${subUrl}">${escapeHtml(subSummary)}</a>
                                    </td>
                                    <td class="col-status">${getStatusBadge(subStatus)}</td>
                                    <td class="col-category">${getCategoryLabel(subIssueType)}</td>
                                    <td class="col-priority">${getPriorityBadge(subPriority)}</td>
                                    <td class="col-req-date">${formatDate(subCreated)}</td>
                                    <td class="col-req-by">${formatText(subReporter)}</td>
                                    <td class="col-handle-by">${formatText(subAssignee)}</td>
                                    <td class="col-due">${formatDueDate(subDueDate, isSubDone)}</td>
                                    ${includeResolvedDate ? `<td class="col-resolved">${isSubDone ? formatDate(subResolutiondate) : formatDate(null)}</td>` : ''}
                                </tr>
                            `;
                        });
                    }

                    return rows;
                }).join('')}
            </tbody>
        </table>
    `;

    const html = buildReportHtml({
        title: reportTitle,
        dateLine: khmerDateLine,
        metaRows: [
            {
                label: 'អ្នកទទួលបន្ទុក:',
                valueHtml: `<strong>${escapeHtml(displayName)}</strong> ${email ? `(${escapeHtml(email)})` : ''}`
            },
            {
                label: 'ស្ថានភាព:',
                valueHtml: `<strong>${escapeHtml(statusLabel)}</strong>`
            },
            {
                label: 'ចំនួនកិច្ចការ:',
                valueHtml: `<strong>${issues.length}</strong> កិច្ចការ`
            }
        ],
        bodyHtml,
        totalCount: issues.length
    });

    return renderPdfFromHtml(html);
}

module.exports = {
    generateMorningCronReport,
    generateTaskReport,
    deduplicateAndIndexIssues,
    buildReportHtml,
    renderPdfFromHtml,
    REPORT_CSS,
    formatKhmerDateText,
    toKhmerDigits,
    getCategoryLabel,
    getStatusBadge,
    getPriorityBadge,
    formatDueDate,
    formatDate,
    formatText,
    KHMER_MONTH_NAMES
};
