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

// Basic markdown escaper for common characters that could break parsing
function escapeMarkdown(text) {
    if (!text) return '';
    return text.toString().replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

module.exports = {
    getTodayDateString,
    getKhmerPriority,
    formatDueDate,
    formatPriorityAndDue,
    escapeMarkdown
};
