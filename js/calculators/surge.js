/**
 * Primal Surge Calculator
 * Simulates permanents played with Primal Surge
 */

import { formatNumber, formatPercentage, createCache, getChartAnimationConfig } from '../utils/simulation.js';
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

    // Clear cache if deck changed
    const newHash = `${deckSize}-${nonPermanents}-${permanents}`;
    if (newHash !== lastDeckHash) {
        simulationCache.clear();
        lastDeckHash = newHash;
    }

    return { deckSize, nonPermanents, permanents, cardData };
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
    const percentData = [];

    // Show results for different numbers of non-permanents
    const maxNonPerm = Math.min(20, Math.floor(config.deckSize * 0.3));
    for (let i = 0; i <= maxNonPerm; i++) {
        const sim = simulatePrimalSurge(config.deckSize, i, config.deckSize - i);
        nonPermRange.push(i);
        expectedPermsData.push(sim.expectedPermanents);
        percentData.push(sim.percentOfDeck);
    }

    if (!chart) {
        // First time: create chart
        chart = new Chart(document.getElementById('surge-chart'), {
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
                        label: '% of Deck',
                        data: percentData,
                        borderColor: '#dc2626',
                        backgroundColor: 'rgba(220, 38, 38, 0.1)',
                        fill: false,
                        tension: 0.3,
                        pointRadius: nonPermRange.map(x => x === config.nonPermanents ? 8 : 4),
                        pointBackgroundColor: nonPermRange.map(x => x === config.nonPermanents ? '#fff' : '#dc2626'),
                        yAxisID: 'yPercent'
                    }
                ]
            },
            options: {
                ...getChartAnimationConfig(),
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => {
                                if (ctx.datasetIndex === 0) {
                                    return `Expected permanents: ${ctx.parsed.y.toFixed(1)}`;
                                } else {
                                    return `% of deck: ${ctx.parsed.y.toFixed(1)}%`;
                                }
                            }
                        }
                    }
                },
                scales: {
                    yPerms: {
                        type: 'linear',
                        position: 'left',
                        beginAtZero: true,
                        title: { display: true, text: 'Expected Permanents', color: '#4ade80' },
                        grid: { color: 'rgba(34, 197, 94, 0.2)' },
                        ticks: { color: '#4ade80' }
                    },
                    yPercent: {
                        type: 'linear',
                        position: 'right',
                        beginAtZero: true,
                        max: 100,
                        title: { display: true, text: '% of Deck', color: '#dc2626' },
                        grid: { drawOnChartArea: false },
                        ticks: { color: '#dc2626' }
                    },
                    x: {
                        grid: { color: 'rgba(34, 197, 94, 0.2)' },
                        ticks: { color: '#a09090' }
                    }
                }
            }
        });
    } else {
        // Subsequent times: update data without recreating
        chart.data.labels = nonPermRange.map(x => x + ' non-perm');
        chart.data.datasets[0].data = expectedPermsData;
        chart.data.datasets[0].pointRadius = nonPermRange.map(x => x === config.nonPermanents ? 8 : 4);
        chart.data.datasets[0].pointBackgroundColor = nonPermRange.map(x => x === config.nonPermanents ? '#fff' : '#4ade80');
        chart.data.datasets[1].data = percentData;
        chart.data.datasets[1].pointRadius = nonPermRange.map(x => x === config.nonPermanents ? 8 : 4);
        chart.data.datasets[1].pointBackgroundColor = nonPermRange.map(x => x === config.nonPermanents ? '#fff' : '#dc2626');
        chart.update();
    }
}

/**
 * Update stats table
 * @param {Object} config - Deck configuration
 * @param {Object} result - Calculation result
 */
function updateTable(config, result) {
    let tableHTML = `
        <tr>
            <th>Metric</th>
            <th>Value</th>
        </tr>
        <tr>
            <td>Total Cards</td>
            <td>${config.deckSize}</td>
        </tr>
        <tr>
            <td>Permanents</td>
            <td>${config.permanents}</td>
        </tr>
        <tr>
            <td>Non-Permanents</td>
            <td>${config.nonPermanents}</td>
        </tr>
        <tr class="current">
            <td>Expected Permanents Played</td>
            <td>${formatNumber(result.expectedPermanents)}</td>
        </tr>
        <tr class="current">
            <td>% of Deck Played</td>
            <td>${formatNumber(result.percentOfDeck, 1)}%</td>
        </tr>
        <tr>
            <td>P(Play Entire Deck)</td>
            <td>${config.nonPermanents === 0 ? '100%' : formatPercentage(1 / config.deckSize, 2)}</td>
        </tr>
    `;

    document.getElementById('surge-statsTable').innerHTML = tableHTML;
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
    const permanentDistribution = new Array(deck.length + 1).fill(0);

    for (let i = 0; i < numSims; i++) {
        // Shuffle deck
        const shuffled = shuffleDeck([...deck]);

        // Simulate Primal Surge - count permanents until hit non-permanent
        const revealedCards = [];
        let permanentCount = 0;

        for (let j = 0; j < shuffled.length; j++) {
            const card = shuffled[j];
            const isNonPermanent = card.types.includes('instant') || card.types.includes('sorcery');

            revealedCards.push({...card, isNonPermanent});

            if (isNonPermanent) {
                break; // Stop at first non-permanent
            }
            permanentCount++;
        }

        totalPermanents += permanentCount;
        permanentDistribution[permanentCount]++;

        // Build HTML for this reveal
        const hitNonPermanent = revealedCards[revealedCards.length - 1]?.isNonPermanent;
        revealsHTML += `<div class="sample-reveal ${!hitNonPermanent ? 'free-spell' : 'whiff'}">`;
        revealsHTML += `<div><strong>Reveal ${i + 1}:</strong></div>`;
        revealsHTML += '<div style="margin: 8px 0;">';

        revealedCards.forEach(card => {
            const primaryType = card.types[0] || 'land';
            revealsHTML += renderCardBadge(card, primaryType);
        });

        revealsHTML += '</div>';
        revealsHTML += `<div class="reveal-summary ${!hitNonPermanent ? 'free-spell' : 'whiff'}">`;

        if (hitNonPermanent) {
            revealsHTML += `<strong>⛔ Stopped!</strong> - ${permanentCount} permanent${permanentCount !== 1 ? 's' : ''} played`;
        } else {
            revealsHTML += `<strong>✓ Full Deck!</strong> - All ${permanentCount} permanents played`;
        }

        revealsHTML += '</div></div>';
    }

    // Calculate average permanents
    const avgPermanents = (totalPermanents / numSims).toFixed(2);
    const avgPercent = ((totalPermanents / numSims / deck.length) * 100).toFixed(1);

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
    distributionHTML += `<strong>Average permanents played:</strong> ${avgPermanents} (${avgPercent}% of deck)`;
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
 * Update deck inputs from imported data
 * @param {Object} typeCounts - Type counts from import
 */
