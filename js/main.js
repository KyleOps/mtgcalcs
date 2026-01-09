/**
 * Main Application Entry Point
 * Initializes calculators, event listeners, and manages tab switching
 */

import * as Portent from './calculators/portent.js';
import * as Surge from './calculators/surge.js';
import * as Wave from './calculators/wave.js';
import * as Vortex from './calculators/vortex.js';
import * as Lands from './calculators/lands.js';
import * as Rashmi from './calculators/rashmi.js';
import { debounce } from './utils/simulation.js';
import * as Components from './utils/components.js';
import * as DeckConfig from './utils/deckConfig.js';

// Current active tab
let currentTab = 'portent';

// Calculator metadata
const calculators = {
    portent: { icon: '⚡', name: 'Portent of Calamity' },
    surge: { icon: '🌿', name: 'Primal Surge' },
    wave: { icon: '🌊', name: 'Genesis Wave' },
    vortex: { icon: '🌀', name: 'Monstrous Vortex' },
    rashmi: { icon: '🌌', name: 'Rashmi' },
    lands: { icon: '🏔️', name: 'Land Drops' }
};

/**
 * Switch between calculator tabs
 * @param {string} tab - Tab name (portent, surge, wave, vortex, lands, rashmi)
 */
function switchTab(tab) {
    // Update body theme
    document.body.className = 'theme-' + tab;

    // Update tab buttons (desktop)
    document.querySelectorAll('.tab-button').forEach(btn => {
        const isActive = btn.dataset.tab === tab;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive);
    });

    // Update dropdown selector (mobile)
    const selectorIcon = document.querySelector('.selector-icon');
    const selectorName = document.querySelector('.selector-name');
    if (selectorIcon && selectorName && calculators[tab]) {
        selectorIcon.textContent = calculators[tab].icon;
        selectorName.textContent = calculators[tab].name;
    }

    // Update dropdown options
    document.querySelectorAll('.selector-option').forEach(option => {
        option.classList.toggle('active', option.dataset.tab === tab);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tab}-tab`).classList.add('active');

    currentTab = tab;

    // Close dropdown if open
    const selector = document.getElementById('calculator-selector');
    if (selector && selector.classList.contains('open')) {
        selector.classList.remove('open');
        document.getElementById('selector-button').setAttribute('aria-expanded', 'false');
    }

    // Update the respective calculator
    if (tab === 'portent') {
        Portent.updateUI();
    } else if (tab === 'surge') {
        Surge.updateUI();
    } else if (tab === 'wave') {
        Wave.updateUI();
    } else if (tab === 'vortex') {
        Vortex.updateUI();
    } else if (tab === 'lands') {
        Lands.updateUI();
    } else if (tab === 'rashmi') {
        Rashmi.updateUI();
    }
}

/**
 * Initialize tab navigation
 */
function initTabNavigation() {
    // Desktop tab buttons
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            switchTab(button.dataset.tab);
        });
    });

    // Mobile dropdown selector
    const selectorButton = document.getElementById('selector-button');
    const selector = document.getElementById('calculator-selector');
    const dropdown = document.getElementById('selector-dropdown');

    if (selectorButton && selector && dropdown) {
        // Toggle dropdown
        selectorButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = selector.classList.toggle('open');
            selectorButton.setAttribute('aria-expanded', isOpen);
        });

        // Handle option clicks
        document.querySelectorAll('.selector-option').forEach(option => {
            option.addEventListener('click', () => {
                switchTab(option.dataset.tab);
            });
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!selector.contains(e.target)) {
                selector.classList.remove('open');
                selectorButton.setAttribute('aria-expanded', 'false');
            }
        });

        // Close dropdown on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && selector.classList.contains('open')) {
                selector.classList.remove('open');
                selectorButton.setAttribute('aria-expanded', 'false');
                selectorButton.focus();
            }
        });
    }
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

    // Sample reveals buttons
    const portentDrawRevealsBtn = document.getElementById('portent-draw-reveals-btn');
    if (portentDrawRevealsBtn) {
        portentDrawRevealsBtn.addEventListener('click', () => {
            Portent.runSampleReveals();
        });
    }

    const surgeDrawRevealsBtn = document.getElementById('surge-draw-reveals-btn');
    if (surgeDrawRevealsBtn) {
        surgeDrawRevealsBtn.addEventListener('click', () => {
            Surge.runSampleReveals();
        });
    }

    const waveDrawRevealsBtn = document.getElementById('wave-draw-reveals-btn');
    if (waveDrawRevealsBtn) {
        waveDrawRevealsBtn.addEventListener('click', () => {
            Wave.runSampleReveals();
        });
    }

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
 * Initialize Vortex calculator inputs
 */
function initVortexInputs() {
    // Vortex calculator has its own init() that handles inputs
    Vortex.init();
}

/**
 * Initialize Lands calculator inputs
 */
function initLandsInputs() {
    const debouncedUpdate = debounce(() => Lands.updateUI(), 150);

    // Listen for deck config changes
    DeckConfig.onDeckUpdate(() => debouncedUpdate());
}

/**
 * Initialize Rashmi calculator inputs
 */
function initRashmiInputs() {
    const debouncedUpdate = debounce(() => Rashmi.updateUI(), 150);

    // CMC value slider and number input
    const cmcSlider = document.getElementById('rashmi-cmcSlider');
    const cmcNumber = document.getElementById('rashmi-cmcValue');
    const excludeXCheckbox = document.getElementById('rashmi-exclude-x');

    cmcSlider.addEventListener('input', () => {
        cmcNumber.value = cmcSlider.value;
        debouncedUpdate();
    });

    cmcNumber.addEventListener('input', () => {
        const val = parseInt(cmcNumber.value) || 1;
        cmcSlider.value = Math.min(Math.max(val, 1), 15);
        debouncedUpdate();
    });

    // Exclude X spells checkbox
    if (excludeXCheckbox) {
        excludeXCheckbox.addEventListener('change', () => {
            debouncedUpdate();
        });
    }

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
    initVortexInputs();
    initLandsInputs();
    initRashmiInputs();
    initServiceWorker();
    initUXEnhancements();

    // Initial render
    Portent.updateUI();

    // Add keyboard navigation
    document.addEventListener('keydown', (e) => {
        // Alt+1/2/3/4/5/6 to switch tabs
        if (e.altKey) {
            if (e.key === '1') switchTab('portent');
            else if (e.key === '2') switchTab('surge');
            else if (e.key === '3') switchTab('wave');
            else if (e.key === '4') switchTab('vortex');
            else if (e.key === '5') switchTab('lands');
            else if (e.key === '6') switchTab('rashmi');
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
