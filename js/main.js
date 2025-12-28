/**
 * Main Application Entry Point
 * Initializes calculators, event listeners, and manages tab switching
 */

import * as Portent from './calculators/portent.js';
import * as Surge from './calculators/surge.js';
import * as Wave from './calculators/wave.js';
import { extractDeckId, importFromMoxfield } from './utils/moxfield.js';
import { debounce } from './utils/simulation.js';

// Current active tab
let currentTab = 'portent';

/**
 * Switch between calculator tabs
 * @param {string} tab - Tab name (portent, surge, wave)
 */
function switchTab(tab) {
    // Update body theme
    document.body.className = 'theme-' + tab;

    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        const isActive = btn.dataset.tab === tab;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tab}-tab`).classList.add('active');

    currentTab = tab;

    // Update the respective calculator
    if (tab === 'portent') {
        Portent.updateUI();
    } else if (tab === 'surge') {
        Surge.updateUI();
    } else if (tab === 'wave') {
        Wave.updateUI();
    }
}

/**
 * Handle Moxfield import for a specific calculator
 * @param {string} mode - Calculator mode (portent, surge, wave)
 */
async function handleImport(mode) {
    const input = document.getElementById(`${mode}-moxfieldUrl`).value.trim();
    const statusEl = document.getElementById(`${mode}-importStatus`);
    const deckInfoEl = document.getElementById(`${mode}-deckInfo`);
    const deckNameEl = document.getElementById(`${mode}-deckName`);
    const importBtn = document.getElementById(`${mode}-importBtn`);

    if (!input) {
        statusEl.textContent = 'Please enter a Moxfield URL or deck ID';
        statusEl.className = 'import-status error';
        return;
    }

    const deckId = extractDeckId(input);

    statusEl.textContent = 'Fetching deck...';
    statusEl.className = 'import-status loading';
    importBtn.disabled = true;
    deckInfoEl.style.display = 'none';

    try {
        const deckData = await importFromMoxfield(deckId);

        // Update all tabs with the imported data
        const modes = ['portent', 'surge', 'wave'];

        for (const targetMode of modes) {
            if (targetMode === 'wave') {
                Wave.updateFromImport(deckData.cmcCounts);
            } else {
                if (targetMode === 'portent') {
                    Portent.updateFromImport(deckData.typeCounts);
                } else if (targetMode === 'surge') {
                    Surge.updateFromImport(deckData.typeCounts);
                }
            }

            // Update deck name and info for all tabs
            const targetDeckNameEl = document.getElementById(`${targetMode}-deckName`);
            const targetDeckInfoEl = document.getElementById(`${targetMode}-deckInfo`);
            if (targetDeckNameEl && targetDeckInfoEl) {
                targetDeckNameEl.textContent = deckData.deckName;
                targetDeckInfoEl.style.display = 'block';
            }
        }

        statusEl.textContent = `Imported ${deckData.totalCards} cards to all tabs!`;
        statusEl.className = 'import-status success';

        deckNameEl.textContent = deckData.deckName;
        deckInfoEl.style.display = 'block';

        // Update all UIs
        Portent.updateUI();
        Surge.updateUI();
        Wave.updateUI();

    } catch (error) {
        console.error('Import error:', error);
        statusEl.textContent = `Import failed: ${error.message}`;
        statusEl.className = 'import-status error';
    } finally {
        importBtn.disabled = false;
    }
}

/**
 * Initialize tab navigation
 */
function initTabNavigation() {
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            switchTab(button.dataset.tab);
        });
    });
}

/**
 * Initialize import handlers
 */
function initImportHandlers() {
    const modes = ['portent', 'surge', 'wave'];

    modes.forEach(mode => {
        const importBtn = document.getElementById(`${mode}-importBtn`);
        const urlInput = document.getElementById(`${mode}-moxfieldUrl`);

        importBtn.addEventListener('click', () => handleImport(mode));

        // Allow Enter key to trigger import
        urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleImport(mode);
            }
        });
    });
}

/**
 * Initialize Portent calculator inputs
 */
function initPortentInputs() {
    const debouncedUpdate = debounce(() => Portent.updateUI(), 150);

    // X value slider and number input
    const xSlider = document.getElementById('portent-xSlider');
    const xNumber = document.getElementById('portent-xValue');

    xSlider.addEventListener('input', () => {
        xNumber.value = xSlider.value;
        debouncedUpdate();
    });

    xNumber.addEventListener('input', () => {
        const val = parseInt(xNumber.value) || 1;
        xSlider.value = Math.min(Math.max(val, 1), 30);
        debouncedUpdate();
    });

    // Type inputs
    const typeInputs = [
        'portent-creatures', 'portent-instants', 'portent-sorceries',
        'portent-artifacts', 'portent-enchantments', 'portent-planeswalkers',
        'portent-lands', 'portent-battles'
    ];

    typeInputs.forEach(id => {
        document.getElementById(id).addEventListener('input', debouncedUpdate);
    });
}

/**
 * Initialize Surge calculator inputs
 */
function initSurgeInputs() {
    const debouncedUpdate = debounce(() => Surge.updateUI(), 150);

    // Type inputs
    const typeInputs = [
        'surge-creatures', 'surge-instants', 'surge-sorceries',
        'surge-artifacts', 'surge-enchantments', 'surge-planeswalkers',
        'surge-lands', 'surge-battles'
    ];

    typeInputs.forEach(id => {
        document.getElementById(id).addEventListener('input', debouncedUpdate);
    });
}

/**
 * Initialize Wave calculator inputs
 */
function initWaveInputs() {
    const debouncedUpdate = debounce(() => Wave.updateUI(), 150);

    // X value slider and number input
    const xSlider = document.getElementById('wave-xSlider');
    const xNumber = document.getElementById('wave-xValue');

    xSlider.addEventListener('input', () => {
        xNumber.value = xSlider.value;
        debouncedUpdate();
    });

    xNumber.addEventListener('input', () => {
        const val = parseInt(xNumber.value) || 1;
        xSlider.value = Math.min(Math.max(val, 1), 30);
        debouncedUpdate();
    });

    // CMC inputs
    const cmcInputs = [
        'wave-cmc0', 'wave-cmc2', 'wave-cmc3', 'wave-cmc4',
        'wave-cmc5', 'wave-cmc6', 'wave-lands', 'wave-nonperm'
    ];

    cmcInputs.forEach(id => {
        document.getElementById(id).addEventListener('input', debouncedUpdate);
    });
}

/**
 * Initialize service worker for offline support
 */
function initServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => {
                    console.log('ServiceWorker registered:', registration);
                })
                .catch(error => {
                    console.log('ServiceWorker registration failed:', error);
                });
        });
    }
}

/**
 * Initialize application
 */
function init() {
    // Initialize all components
    initTabNavigation();
    initImportHandlers();
    initPortentInputs();
    initSurgeInputs();
    initWaveInputs();
    initServiceWorker();

    // Initial render
    Portent.updateUI();

    // Add keyboard navigation
    document.addEventListener('keydown', (e) => {
        // Alt+1/2/3 to switch tabs
        if (e.altKey) {
            if (e.key === '1') switchTab('portent');
            else if (e.key === '2') switchTab('surge');
            else if (e.key === '3') switchTab('wave');
        }
    });

    console.log('MTG Calculator initialized');
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
