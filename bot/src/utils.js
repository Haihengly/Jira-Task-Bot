function getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getKhmerPriority(priorityName) {
    if (!priorityName || priorityName.toLowerCase() === 'none') {
        return { emoji: '⚪', label: 'គ្មាន' };
    }

    const lower = priorityName.toLowerCase();

    // Exact or substring matches, ordered specifically to prevent 'highest' triggering 'high'
    if (lower.includes('highest')) return { emoji: '🔴', label: 'ខ្ពស់បំផុត' };
    if (lower.includes('high')) return { emoji: '🟠', label: 'ខ្ពស់' };
    if (lower.includes('medium')) return { emoji: '🟡', label: 'មធ្យម' };
    if (lower.includes('lowest')) return { emoji: '⚪', label: 'ទាបបំផុត' };
    if (lower.includes('low')) return { emoji: '🔵', label: 'ទាប' };

    return { emoji: '⚪', label: 'គ្មាន' };
}

function formatDueDate(dueDateStr) {
    if (!dueDateStr) return null;
    const [year, month, day] = dueDateStr.split('-').map(Number);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (!month || isNaN(month) || month < 1 || month > 12) return dueDateStr;
    return `${monthNames[month - 1]} ${day}`;
}

function formatPriorityAndDue(priorityName, dueDate, options = {}) {
    const {
        withPriorityLabel = false,
        today = getTodayDateString(),
        alwaysShowDueDate = false
    } = options;
    const { emoji, label } = getKhmerPriority(priorityName);
    const formattedDueDate = formatDueDate(dueDate);
    const isOverdue = dueDate && dueDate < today;

    let dueText = '';
    if (formattedDueDate) {
        dueText = ` | ថ្ងៃកំណត់៖ ${formattedDueDate}${isOverdue ? ' ⚠️ ផុតកំណត់' : ''}`;
    } else if (alwaysShowDueDate) {
        dueText = ` | ថ្ងៃកំណត់៖ គ្មាន`;
    }

    const priorityText = withPriorityLabel ? `អតិភាព: ${label}` : label;
    return `${emoji} ${priorityText}${dueText}`;
}

/**
 * Format current date in Cambodia local time (UTC+7) as YYYYMMDD string.
 * @param {Date|string} [date=new Date()]
 * @returns {string} e.g. "20261005"
 */
function getCambodiaDateYMD(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const year = d.toLocaleDateString('en-GB', { timeZone: 'Asia/Phnom_Penh', year: 'numeric' });
    const month = d.toLocaleDateString('en-GB', { timeZone: 'Asia/Phnom_Penh', month: '2-digit' });
    const day = d.toLocaleDateString('en-GB', { timeZone: 'Asia/Phnom_Penh', day: '2-digit' });
    return `${year}${month}${day}`;
}

/**
 * Build PDF export caption in format: {YYYYMMDD}_របាយការណ៍កិច្ចការ{status}{timeframe}
 * @param {string} status 'To Do', 'In Progress', 'Done', etc.
 * @param {string} [timeframe='តាមស្ថានភាព'] e.g. 'តាមស្ថានភាព' or custom date range label
 * @param {Date|string} [date=new Date()] Date to format
 * @returns {string}
 */
function buildTaskReportCaption(status, timeframe = 'តាមស្ថានភាព', date = new Date()) {
    const statusMap = {
        'To Do': 'ត្រូវធ្វើ',
        'In Progress': 'កំពុងធ្វើ',
        'Done': 'បានធ្វើរួច'
    };
    const statusKhmer = statusMap[status] || status;
    const ymd = getCambodiaDateYMD(date);
    return `${ymd}_របាយការណ៍កិច្ចការ${statusKhmer}${timeframe}`;
}

// Basic markdown escaper for common characters that could break parsing
function escapeMarkdown(text) {
    if (!text) return '';
    return text.toString().replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

module.exports = {
    getTodayDateString,
    getCambodiaDateYMD,
    buildTaskReportCaption,
    getKhmerPriority,
    formatDueDate,
    formatPriorityAndDue,
    escapeMarkdown
};
