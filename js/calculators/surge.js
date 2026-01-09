/**
 * Primal Surge Calculator
 * Simulates permanents played with Primal Surge
 */

import { formatNumber, formatPercentage, createCache, debounce } from '../utils/simulation.js';
import { renderMultiColumnTable } from '../utils/tableUtils.js';
import { createOrUpdateChart } from '../utils/chartHelpers.js';
import * as DeckConfig from '../utils/deckConfig.js';
import {
    buildDeckFromCardData, shuffleDeck, renderCardBadge, renderDistributionChart,
    createCollapsibleSection, extractCardTypes
} from '../utils/sampleSimulator.js';

const CONFIG = {
    ITERATIONS: 15000
};

let simulationCache = createCache(50);
let lastDeckHash = '';
let chart = null;

/**
 * Simulate Primal Surge
 * @param {number} deckSize - Total cards in library
 * @param {number} nonPermanents - Number of non-permanent cards
 * @param {number} permanents - Number of permanent cards
 * @returns {Object} - Simulation results
 */
export function simulatePrimalSurge(deckSize, nonPermanents, permanents) {
    // Check cache first
    const cacheKey = `${deckSize}-${nonPermanents}`;
    const cached = simulationCache.get(cacheKey);
    if (cached) return cached;

    let totalPermanents = 0;

    // Build deck: 0 = permanent, 1 = non-permanent
    const deck = new Uint8Array(deckSize);
    for (let i = 0; i < nonPermanents; i++) {
        deck[i] = 1;
    }
    // Rest are permanents (default 0)

    for (let iter = 0; iter < CONFIG.ITERATIONS; iter++) {
        // Shuffle using Fisher-Yates
        for (let i = deckSize - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = deck[i];
            deck[i] = deck[j];
            deck[j] = temp;
        }

        // Count permanents until we hit a non-permanent
        let count = 0;
        for (let i = 0; i < deckSize; i++) {
            if (deck[i] === 1) {
                break; // Hit a non-permanent
            }
            count++;
        }

        totalPermanents += count;
    }

    const result = {
        expectedPermanents: totalPermanents / CONFIG.ITERATIONS,
        percentOfDeck: (totalPermanents / CONFIG.ITERATIONS / deckSize) * 100
    };

    // Cache the result
    simulationCache.set(cacheKey, result);
    return result;
}

/**
 * Get current deck configuration from shared config
 * @returns {Object} - Deck configuration
 */
export function getDeckConfig() {
    const config = DeckConfig.getDeckConfig();
    const cardData = DeckConfig.getImportedCardData();

    // Use shared getDeckSize function to properly handle dual-typed cards
    const deckSize = DeckConfig.getDeckSize(true);  // Include non-permanents

    // For simulation purposes, count instants and sorceries as non-permanents
    const nonPermanents = config.instants + config.sorceries;
    const permanents = deckSize - nonPermanents;

    let lands = 0;
    let totalPermCMC = 0;

    if (cardData && cardData.cardsByName && Object.keys(cardData.cardsByName).length > 0) {
        Object.values(cardData.cardsByName).forEach(card => {
            const typeLine = (card.type_line || '').toLowerCase();
            const hasPermType = ['creature', 'artifact', 'enchantment', 'planeswalker', 'battle', 'land'].some(t => typeLine.includes(t));
            
            if (hasPermType) {
                if (typeLine.includes('land')) {
                    lands += card.count;
                }
                if (card.cmc) {
                    totalPermCMC += card.cmc * card.count;
                }
            }
        });
    } else {
        // Fallback for manual config
        lands = config.lands;
        // Estimate CMC from buckets (using weighted averages)
        totalPermCMC = (config.cmc0 || 0) * 0 +
                       (config.cmc2 || 0) * 2 +
                       (config.cmc3 || 0) * 3 +
                       (config.cmc4 || 0) * 4 +
                       (config.cmc5 || 0) * 5 +
                       (config.cmc6 || 0) * 7;
    }

    // Clear cache if deck changed
    const newHash = `${deckSize}-${nonPermanents}-${permanents}-${lands}-${totalPermCMC}`;
    if (newHash !== lastDeckHash) {
        simulationCache.clear();
        lastDeckHash = newHash;
    }

    return { deckSize, nonPermanents, permanents, cardData, lands, totalPermCMC };
}

/**
 * Calculate results for current deck configuration
 * @returns {Object} - Calculation results
 */
export function calculate() {
    const config = getDeckConfig();

    if (config.deckSize === 0) {
        return { config, result: null };
    }

    const result = simulatePrimalSurge(config.deckSize, config.nonPermanents, config.permanents);

    return { config, result };
}

/**
 * Update chart visualization
 * @param {Object} config - Deck configuration
 * @param {Object} result - Calculation result
 */
function updateChart(config, result) {
    const nonPermRange = [];
    const expectedPermsData = [];
    const expectedMVData = [];

    const avgMVPerPerm = config.permanents > 0 ? config.totalPermCMC / config.permanents : 0;

    // Show results for different numbers of non-permanents
    const maxNonPerm = Math.min(20, Math.floor(config.deckSize * 0.3));
    for (let i = 0; i <= maxNonPerm; i++) {
        const sim = simulatePrimalSurge(config.deckSize, i, config.deckSize - i);
        nonPermRange.push(i);
        expectedPermsData.push(sim.expectedPermanents);
        expectedMVData.push(sim.expectedPermanents * avgMVPerPerm);
    }

    chart = createOrUpdateChart(chart, 'surge-chart', {
        type: 'line',
        data: {
            labels: nonPermRange.map(x => x + ' non-perm'),
            datasets: [
                {
                    label: 'Expected Permanents',
                    data: expectedPermsData,
                    borderColor: '#4ade80',
                    backgroundColor: 'rgba(74, 222, 128, 0.1)',
                    fill: false,
                    tension: 0.3,
                    pointRadius: nonPermRange.map(x => x === config.nonPermanents ? 8 : 4),
                    pointBackgroundColor: nonPermRange.map(x => x === config.nonPermanents ? '#fff' : '#4ade80'),
                    yAxisID: 'yPerms'
                },
                {
                    label: 'Expected Total Mana Value',
                    data: expectedMVData,
                    borderColor: '#c084fc',
                    backgroundColor: 'rgba(192, 132, 252, 0.1)',
                    fill: false,
                    tension: 0.3,
                    pointRadius: nonPermRange.map(x => x === config.nonPermanents ? 8 : 4),
                    pointBackgroundColor: nonPermRange.map(x => x === config.nonPermanents ? '#fff' : '#c084fc'),
                    yAxisID: 'yMV'
                }
            ]
        },
        options: {
            scales: {
                yPerms: {
                    type: 'linear',
                    position: 'left',
                    beginAtZero: true,
                    title: { display: true, text: 'Expected Permanents', color: '#4ade80' },
                    grid: { color: 'rgba(34, 197, 94, 0.2)' },
                    ticks: { color: '#4ade80' }
                },
                yMV: {
                    type: 'linear',
                    position: 'right',
                    beginAtZero: true,
                    title: { display: true, text: 'Total Mana Value', color: '#c084fc' },
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#c084fc' }
                },
                x: {
                    grid: { color: 'rgba(34, 197, 94, 0.2)' },
                    ticks: { color: '#a09090' }
                }
            }
        }
    });
}

/**
 * Update stats table
 * @param {Object} config - Deck configuration
 * @param {Object} result - Calculation result
 */
function updateTable(config, result) {
    const avgLands = config.permanents > 0 ? result.expectedPermanents * (config.lands / config.permanents) : 0;
    const avgCMC = config.permanents > 0 ? result.expectedPermanents * (config.totalPermCMC / config.permanents) : 0;

    const headers = ['Metric', 'Value'];
    
    const rows = [
        ['Total Cards', config.deckSize],
        ['Permanents', config.permanents],
        ['Non-Permanents', config.nonPermanents],
        { cells: ['Expected Permanents Played', formatNumber(result.expectedPermanents)], class: 'current' },
        { cells: ['Avg Lands Put In', formatNumber(avgLands, 1)], class: 'current' },
        { cells: ['Avg Mana Value Put In', formatNumber(avgCMC, 1)], class: 'current' },
        ['P(Play Entire Deck)', config.nonPermanents === 0 ? '100%' : formatPercentage(1 / config.deckSize, 2)]
    ];

    renderMultiColumnTable('surge-statsTable', headers, rows);
}

/**
 * Update comparison with Genesis Wave
 * @param {Object} config - Deck configuration
 * @param {Object} result - Calculation result
 */
function updateComparison(config, result) {
    // Import wave simulator to compare
    import('./wave.js').then(waveModule => {
        const waveResult = waveModule.simulateGenesisWave(config.deckSize, {
            cmc0: 0, cmc2: 0, cmc3: 0, cmc4: 0, cmc5: 0, cmc6: 0,
            lands: config.permanents,
            nonperm: config.nonPermanents
        }, 7);

        if (waveResult) {
            const surgeBetter = result.expectedPermanents > waveResult.expectedPermanents;
            const difference = Math.abs(result.expectedPermanents - waveResult.expectedPermanents);
            const percentDiff = ((difference / waveResult.expectedPermanents) * 100).toFixed(1);

            const comparisonPanel = document.getElementById('surge-comparison-panel');
            const comparisonInsight = document.getElementById('surge-comparison-insight');

            if (comparisonPanel) {
                comparisonPanel.style.display = 'block';
            }
            if (comparisonInsight) {
                comparisonInsight.innerHTML = `
                    <h3>Comparison at 10 Mana</h3>
                    <p>
                        <strong>Primal Surge (10 mana):</strong> ${formatNumber(result.expectedPermanents)} expected permanents<br>
                        <strong>Genesis Wave X=7 (10 mana):</strong> ${formatNumber(waveResult.expectedPermanents)} expected permanents<br><br>
                        ${surgeBetter
                            ? `<span class="marginal-positive">✓ Primal Surge is better by ${formatNumber(difference)} permanents (${percentDiff}% more)</span>`
                            : `<span class="marginal-negative">✗ Genesis Wave X=7 is better by ${formatNumber(difference)} permanents (${percentDiff}% more)</span>`
                        }
                    </p>
                `;
            }
        } else {
            const comparisonPanel = document.getElementById('surge-comparison-panel');
            if (comparisonPanel) {
                comparisonPanel.style.display = 'none';
            }
        }
    });
}

/**
 * Run sample Primal Surge simulations and display them
 */
export function runSampleReveals() {
    const config = getDeckConfig();
    const cardData = config.cardData;

    if (!cardData || !cardData.cardsByName || Object.keys(cardData.cardsByName).length === 0) {
        document.getElementById('surge-reveals-display').innerHTML = '<p style="color: var(--text-dim);">Import a decklist to see sample reveals</p>';
        return;
    }

    // Get number of simulations from input (no cap)
    const countInput = document.getElementById('surge-sample-count');
    const numSims = Math.max(1, parseInt(countInput?.value) || 10);

    // Build deck array with full card objects
    const deck = buildDeckFromCardData(cardData);

    // Run simulations
    let revealsHTML = '';
    let totalPermanents = 0;
    let totalManaValue = 0;
    let totalLands = 0;
    const permanentDistribution = new Array(deck.length + 1).fill(0);

    for (let i = 0; i < numSims; i++) {
        // Shuffle deck
        const shuffled = shuffleDeck([...deck]);

        // Simulate Primal Surge - count permanents until hit non-permanent
        const revealedCards = [];
        let permanentCount = 0;
        let runManaValue = 0;
        let runLands = 0;

        for (let j = 0; j < shuffled.length; j++) {
            const card = shuffled[j];
            const isNonPermanent = card.types.includes('instant') || card.types.includes('sorcery');

            revealedCards.push({...card, isNonPermanent});

            if (isNonPermanent) {
                break; // Stop at first non-permanent
            }
            
            permanentCount++;
            if (card.cmc) runManaValue += card.cmc;
            if (card.types.includes('land')) runLands++;
        }

        totalPermanents += permanentCount;
        totalManaValue += runManaValue;
        totalLands += runLands;
        permanentDistribution[permanentCount]++;

        // Build HTML for this reveal
        const hitNonPermanent = revealedCards[revealedCards.length - 1]?.isNonPermanent;
        revealsHTML += `<div class="sample-reveal ${!hitNonPermanent ? 'free-spell' : 'whiff'}">`;
        revealsHTML += `<div><strong>Reveal ${i + 1}:</strong> ${permanentCount} perms (${runLands} lands, ${runManaValue} total CMC)</div>`;
        revealsHTML += '<div style="margin: 8px 0;">';

        revealedCards.forEach(card => {
            const primaryType = card.types[0] || 'land';
            revealsHTML += renderCardBadge(card, primaryType);
        });

        revealsHTML += '</div>';
        revealsHTML += `<div class="reveal-summary ${!hitNonPermanent ? 'free-spell' : 'whiff'}">`;

        if (hitNonPermanent) {
            revealsHTML += `<strong>⛔ Stopped!</strong>`;
        } else {
            revealsHTML += `<strong>✓ Full Deck!</strong>`;
        }

        revealsHTML += '</div></div>';
    }

    // Calculate averages
    const avgPermanents = (totalPermanents / numSims).toFixed(2);
    const avgMana = (totalManaValue / numSims).toFixed(1);
    const avgLands = (totalLands / numSims).toFixed(1);

    // Build distribution chart
    let distributionHTML = '<div style="margin-top: var(--spacing-md); padding: var(--spacing-md); background: var(--panel-bg-alt); border-radius: var(--radius-md);">';
    distributionHTML += '<h4 style="margin-top: 0;">Permanent Distribution:</h4>';
    distributionHTML += renderDistributionChart(
        permanentDistribution,
        numSims,
        (count) => `${count.toString().padStart(2)} permanents`,
        (count) => count === deck.length ? ' ← FULL DECK' : ''
    );

    distributionHTML += `<div style="margin-top: var(--spacing-md); text-align: center;">`;
    distributionHTML += `<strong>Averages:</strong> ${avgPermanents} permanents, ${avgLands} lands, ${avgMana} total CMC`;
    distributionHTML += '</div></div>';

    // Make reveals collapsible
    const revealsSectionHTML = createCollapsibleSection(
        `Show/Hide Individual Reveals (${numSims} simulations)`,
        revealsHTML,
        true
    );

    document.getElementById('surge-reveals-display').innerHTML = distributionHTML + revealsSectionHTML;
}

/**
 * Update all UI elements
 */
export function updateUI() {
    const { config, result } = calculate();

    if (config.deckSize === 0 || !result) {
        if (chart) chart.destroy();
        document.getElementById('surge-statsTable').innerHTML = '';
        return;
    }

    updateChart(config, result);
    updateTable(config, result);
    updateComparison(config, result);

    // Draw initial sample reveals if we have card data
    if (config.cardData && config.cardData.cardsByName && Object.keys(config.cardData.cardsByName).length > 0) {
        runSampleReveals();
    }
}

/**
 * Initialize Surge calculator
 */
export function init() {
    const debouncedUpdate = debounce(() => updateUI(), 150);

    // Bind sample reveal button
    const surgeDrawRevealsBtn = document.getElementById('surge-draw-reveals-btn');
    if (surgeDrawRevealsBtn) {
        surgeDrawRevealsBtn.addEventListener('click', () => {
            runSampleReveals();
        });
    }

    // Listen for deck configuration changes
    DeckConfig.onDeckUpdate(() => {
        debouncedUpdate();
    });

    updateUI();
}

/**
 * Update deck inputs from imported data
 * @param {Object} typeCounts - Type counts from import
 */
