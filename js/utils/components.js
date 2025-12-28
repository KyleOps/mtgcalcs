/**
 * Reusable UI Components
 * Creates and manages reusable UI elements
 */

/**
 * Create a collapsible panel
 * @param {string} id - Panel ID
 * @param {string} title - Panel title
 * @param {HTMLElement} content - Content element
 * @param {boolean} startOpen - Whether to start expanded
 * @returns {HTMLElement} - Panel element
 */
export function createCollapsiblePanel(id, title, content, startOpen = true) {
    const panel = document.createElement('section');
    panel.className = `panel collapsible-panel${startOpen ? ' expanded' : ''}`;
    panel.id = id;

    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = `
        <h2>${title}</h2>
        <button class="collapse-btn" aria-label="Toggle section">
            <span class="collapse-icon">${startOpen ? '▼' : '▶'}</span>
        </button>
    `;

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'panel-content';
    contentWrapper.appendChild(content);

    panel.appendChild(header);
    panel.appendChild(contentWrapper);

    // Add click handler
    header.addEventListener('click', () => togglePanel(panel));

    return panel;
}

/**
 * Toggle a collapsible panel
 * @param {HTMLElement} panel - Panel element
 */
export function togglePanel(panel) {
    const isExpanded = panel.classList.contains('expanded');
    const icon = panel.querySelector('.collapse-icon');

    panel.classList.toggle('expanded');
    if (icon) {
        icon.textContent = isExpanded ? '▶' : '▼';
    }

    // Save state to localStorage
    if (panel.id) {
        localStorage.setItem(`panel-${panel.id}`, !isExpanded);
    }
}

/**
 * Restore panel states from localStorage
 */
export function restorePanelStates() {
    document.querySelectorAll('.collapsible-panel').forEach(panel => {
        if (panel.id) {
            const savedState = localStorage.getItem(`panel-${panel.id}`);
            if (savedState === 'false') {
                togglePanel(panel);
            }
        }
    });
}

/**
 * Initialize all collapsible panels
 */
export function initCollapsiblePanels() {
    document.querySelectorAll('.panel-header').forEach(header => {
        header.addEventListener('click', (e) => {
            const panel = header.closest('.collapsible-panel');
            if (panel) {
                togglePanel(panel);
            }
        });
    });

    // Restore saved states
    restorePanelStates();
}

/**
 * Create a type input group (reusable component)
 * @param {string} id - Input ID
 * @param {string} label - Input label
 * @param {number} defaultValue - Default value
 * @returns {HTMLElement} - Type input element
 */
export function createTypeInput(id, label, defaultValue = 0) {
    const div = document.createElement('div');
    div.className = 'type-input';
    div.innerHTML = `
        <label for="${id}">${label}</label>
        <input type="number" id="${id}" value="${defaultValue}" min="0" aria-label="${label}">
    `;
    return div;
}

/**
 * Create a deck total display
 * @param {string} id - Display ID
 * @param {number} initialTotal - Initial total
 * @returns {HTMLElement} - Deck total element
 */
export function createDeckTotal(id, initialTotal = 0) {
    const div = document.createElement('div');
    div.className = 'deck-total';
    div.innerHTML = `
        Total cards in library: <span id="${id}">${initialTotal}</span>
    `;
    return div;
}

/**
 * Auto-collapse config panels on mobile after calculation
 */
export function autoCollapseOnMobile() {
    if (window.innerWidth <= 900) {
        document.querySelectorAll('.collapsible-panel.config').forEach(panel => {
            if (panel.classList.contains('expanded')) {
                togglePanel(panel);
            }
        });

        // Expand results panels
        document.querySelectorAll('.collapsible-panel.results').forEach(panel => {
            if (!panel.classList.contains('expanded')) {
                togglePanel(panel);
            }
        });

        // Scroll to results
        const resultsPanel = document.querySelector('.collapsible-panel.results');
        if (resultsPanel) {
            setTimeout(() => {
                resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 300);
        }
    }
}
