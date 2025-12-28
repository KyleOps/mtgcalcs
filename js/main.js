/**
 * Main Application Entry Point
 * Initializes calculators, event listeners, and manages tab switching
 */

import * as Portent from './calculators/portent.js';
import * as Surge from './calculators/surge.js';
import * as Wave from './calculators/wave.js';
import { debounce } from './utils/simulation.js';
import * as Components from './utils/components.js';
import * as DeckConfig from './utils/deckConfig.js';

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

    // Listen for deck config changes
    DeckConfig.onDeckUpdate(() => debouncedUpdate());
}

/**
 * Initialize Surge calculator inputs
 */
function initSurgeInputs() {
    const debouncedUpdate = debounce(() => Surge.updateUI(), 150);

    // Listen for deck config changes
    DeckConfig.onDeckUpdate(() => debouncedUpdate());
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

    // Listen for deck config changes
    DeckConfig.onDeckUpdate(() => debouncedUpdate());
}

/**
 * Initialize service worker for offline support
 */
function initServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            // Get the correct path for service worker based on deployment
            const swPath = window.location.pathname.includes('/mtgcalcs/')
                ? '/mtgcalcs/sw.js'
                : '/sw.js';

            navigator.serviceWorker.register(swPath)
                .then(registration => {
                    console.log('ServiceWorker registered:', registration);
                })
                .catch(error => {
                    console.log('ServiceWorker registration failed (optional):', error);
                });
        });
    }
}

/**
 * Initialize UX enhancements
 */
function initUXEnhancements() {
    // Initialize collapsible panels
    Components.initCollapsiblePanels();

    // Auto-collapse config on mobile after calculations
    window.addEventListener('resize', () => {
        if (window.innerWidth <= 900) {
            Components.autoCollapseOnMobile();
        }
    });
}

/**
 * Initialize application
 */
function init() {
    // Initialize shared deck configuration first
    DeckConfig.initDeckConfig();

    // Initialize all components
    initTabNavigation();
    initPortentInputs();
    initSurgeInputs();
    initWaveInputs();
    initServiceWorker();
    initUXEnhancements();

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

    // Mark as visited
    if (!localStorage.getItem('visited')) {
        localStorage.setItem('visited', 'true');
    }

    console.log('MTG Calculator initialized');
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
