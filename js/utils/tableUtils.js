/**
 * Table Rendering Utilities
 * Shared functions for creating comparison tables
 */

/**
 * Create a comparison table with two columns
 * @param {Array} rows - Array of {label, value} objects
 * @param {string} highlightClass - Optional class for highlighting rows
 * @returns {string} - HTML table string
 */
export function createComparisonTable(rows, highlightClass = 'current') {
    let html = '<thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>';

    rows.forEach(row => {
        const rowClass = row.highlight ? highlightClass : '';
        html += `
            <tr${rowClass ? ` class="${rowClass}"` : ''}>
                <td>${row.label}</td>
                <td>${row.value}</td>
            </tr>
        `;
    });

    html += '</tbody>';
    return html;
}

/**
 * Create a multi-column comparison table
 * @param {Array} headers - Array of header strings
 * @param {Array} rows - Array of row arrays
 * @param {number} highlightRow - Index of row to highlight (optional)
 * @returns {string} - HTML table string
 */
export function createMultiColumnTable(headers, rows, highlightRow = -1) {
    let html = '<thead><tr>';
    headers.forEach(header => {
        html += `<th>${header}</th>`;
    });
    html += '</tr></thead><tbody>';

    rows.forEach((row, index) => {
        const rowClass = index === highlightRow ? 'current' : '';
        html += `<tr${rowClass ? ` class="${rowClass}"` : ''}>`;
        row.forEach(cell => {
            html += `<td>${cell}</td>`;
        });
        html += '</tr>';
    });

    html += '</tbody>';
    return html;
}

/**
 * Render a table to a DOM element
 * @param {string} elementId - ID of table element
 * @param {string} tableHTML - HTML string to render
 */
export function renderTable(elementId, tableHTML) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = tableHTML;
    }
}

/**
 * Clear a table
 * @param {string} elementId - ID of table element
 */
export function clearTable(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = '';
    }
}
