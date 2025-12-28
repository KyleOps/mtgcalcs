/**
 * Portent of Calamity Calculator
 * Simulates card type diversity for Portent of Calamity spell
 */

import { createCache, partialShuffle, formatNumber, formatPercentage } from '../utils/simulation.js';

const CONFIG = {
    ITERATIONS: 25000,
    X_RANGE_BEFORE: 3,
    X_RANGE_AFTER: 4,
    FREE_SPELL_THRESHOLD: 4
};

let simulationCache = createCache(50);
let lastDeckHash = '';
let chart = null;

/**
 * Run Monte Carlo simulation for Portent of Calamity
 * @param {number} deckSize - Total cards in library
 * @param {Object} typeCounts - Card counts by type
 * @param {number} x - X value (cards to reveal)
 * @returns {Object} - Simulation results
 */
function simulatePortent(deckSize, typeCounts, x) {
    const cacheKey = `${deckSize}-${x}`;
    const cached = simulationCache.get(cacheKey);
    if (cached) return cached;

    const types = Object.keys(typeCounts).filter(t => typeCounts[t] > 0);
    const numTypes = types.length;

    // Build deck array with type indices
    const deck = new Int8Array(deckSize);
    let idx = 0;
    types.forEach((type, typeIdx) => {
        const count = typeCounts[type];
        for (let i = 0; i < count; i++) {
            deck[idx++] = typeIdx;
        }
    });
    for (let i = idx; i < deckSize; i++) {
        deck[i] = -1; // Empty slots
    }

    const typeCountDist = new Uint32Array(numTypes + 1);
    let totalCardsToHand = 0;
    const drawCount = Math.min(x, deckSize);
    const seenTypes = new Uint8Array(numTypes);

    // Run simulations
    for (let iter = 0; iter < CONFIG.ITERATIONS; iter++) {
        seenTypes.fill(0);
        let uniqueTypes = 0;

        // Partial Fisher-Yates shuffle
        partialShuffle(deck, drawCount, deckSize);

        // Count unique types
        for (let i = 0; i < drawCount; i++) {
            const cardType = deck[i];
            if (cardType >= 0 && !seenTypes[cardType]) {
                seenTypes[cardType] = 1;
                uniqueTypes++;
            }
        }

        typeCountDist[uniqueTypes]++;
        totalCardsToHand += uniqueTypes >= CONFIG.FREE_SPELL_THRESHOLD ? uniqueTypes - 1 : uniqueTypes;
    }

    const result = {
        typeDist: Array.from(typeCountDist).map(c => c / CONFIG.ITERATIONS),
        expectedCardsToHand: totalCardsToHand / CONFIG.ITERATIONS
    };

    simulationCache.set(cacheKey, result);
    return result;
}

/**
 * Get current deck configuration from DOM
 * @returns {Object} - Deck configuration
 */
export function getDeckConfig() {
    const types = {
        creature: parseInt(document.getElementById('portent-creatures').value) || 0,
        instant: parseInt(document.getElementById('portent-instants').value) || 0,
        sorcery: parseInt(document.getElementById('portent-sorceries').value) || 0,
        artifact: parseInt(document.getElementById('portent-artifacts').value) || 0,
        enchantment: parseInt(document.getElementById('portent-enchantments').value) || 0,
        planeswalker: parseInt(document.getElementById('portent-planeswalkers').value) || 0,
        land: parseInt(document.getElementById('portent-lands').value) || 0,
        battle: parseInt(document.getElementById('portent-battles').value) || 0
    };

    const deckSize = Object.values(types).reduce((sum, count) => sum + count, 0);

    // Clear cache if deck changed
    const newHash = JSON.stringify(types);
    if (newHash !== lastDeckHash) {
        simulationCache.clear();
        lastDeckHash = newHash;
    }

    document.getElementById('portent-deckSize').textContent = deckSize;

    const xSlider = document.getElementById('portent-xSlider');
    xSlider.max = Math.min(deckSize, 30);

    return {
        deckSize,
        x: parseInt(document.getElementById('portent-xValue').value) || 5,
        types
    };
}

/**
 * Calculate probabilities for current deck configuration
 * @returns {Object} - Calculation results
 */
export function calculate() {
    const config = getDeckConfig();

    if (config.deckSize === 0) {
        return { config, results: {} };
    }

    const results = {};
    const minX = Math.max(1, config.x - CONFIG.X_RANGE_BEFORE);
    const maxX = Math.min(config.x + CONFIG.X_RANGE_AFTER, config.deckSize);

    for (let testX = minX; testX <= maxX; testX++) {
        const sim = simulatePortent(config.deckSize, config.types, testX);
        const typeDist = sim.typeDist;

        results[testX] = {
            expectedCards: sim.expectedCardsToHand,
            prob4Plus: typeDist.slice(CONFIG.FREE_SPELL_THRESHOLD).reduce((a, b) => a + b, 0),
            probExact4: typeDist[CONFIG.FREE_SPELL_THRESHOLD] || 0,
            prob5Plus: typeDist.slice(CONFIG.FREE_SPELL_THRESHOLD + 1).reduce((a, b) => a + b, 0),
            expectedTypes: typeDist.reduce((sum, p, i) => sum + p * i, 0)
        };
    }

    return { config, results };
}

/**
 * Update chart visualization
 * @param {Object} config - Deck configuration
 * @param {Object} results - Calculation results
 */
function updateChart(config, results) {
    const xValues = Object.keys(results).map(Number).sort((a, b) => a - b);
    const prob4PlusData = xValues.map(x => results[x].prob4Plus * 100);
    const expectedCardsData = xValues.map(x => results[x].expectedCards);

    if (chart) chart.destroy();

    chart = new Chart(document.getElementById('portent-combinedChart'), {
        type: 'line',
        data: {
            labels: xValues.map(x => 'X=' + x),
            datasets: [
                {
                    label: 'P(Free Spell) %',
                    data: prob4PlusData,
                    borderColor: '#c084fc',
                    backgroundColor: 'rgba(192, 132, 252, 0.1)',
                    fill: false,
                    tension: 0.3,
                    pointRadius: xValues.map(x => x === config.x ? 8 : 4),
                    pointBackgroundColor: xValues.map(x => x === config.x ? '#fff' : '#c084fc'),
                    yAxisID: 'yProb'
                },
                {
                    label: 'Expected Cards',
                    data: expectedCardsData,
                    borderColor: '#dc2626',
                    backgroundColor: 'rgba(220, 38, 38, 0.1)',
                    fill: false,
                    tension: 0.3,
                    pointRadius: xValues.map(x => x === config.x ? 8 : 4),
                    pointBackgroundColor: xValues.map(x => x === config.x ? '#fff' : '#dc2626'),
                    yAxisID: 'yCards'
                }
            ]
        },
        options: {
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
                                return `Free spell: ${ctx.parsed.y.toFixed(1)}%`;
                            } else {
                                return `Cards to hand: ${ctx.parsed.y.toFixed(2)}`;
                            }
                        }
                    }
                }
            },
            scales: {
                yProb: {
                    type: 'linear',
                    position: 'left',
                    beginAtZero: true,
                    max: 100,
                    title: { display: true, text: 'P(Free Spell) %', color: '#c084fc' },
                    grid: { color: 'rgba(139, 0, 0, 0.2)' },
                    ticks: { color: '#c084fc' }
                },
                yCards: {
                    type: 'linear',
                    position: 'right',
                    beginAtZero: true,
                    title: { display: true, text: 'Expected Cards', color: '#dc2626' },
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#dc2626' }
                },
                x: {
                    grid: { color: 'rgba(139, 0, 0, 0.2)' },
                    ticks: { color: '#a09090' }
                }
            }
        }
    });
}

/**
 * Update comparison table
 * @param {Object} config - Deck configuration
 * @param {Object} results - Calculation results
 */
function updateTable(config, results) {
    const xValues = Object.keys(results).map(Number).sort((a, b) => a - b);
    const currentResult = results[config.x];

    let tableHTML = `
        <tr>
            <th>X</th>
            <th>P(Free Spell)</th>
            <th>Δ Prob</th>
            <th>E[Cards]</th>
            <th>Δ Cards</th>
        </tr>
    `;

    xValues.forEach((x) => {
        const r = results[x];
        const deltaProb = (r.prob4Plus - currentResult.prob4Plus) * 100;
        const deltaCards = r.expectedCards - currentResult.expectedCards;

        const rowClass = x === config.x ? 'current' : '';
        const isBaseline = x === config.x;

        const probClass = deltaProb > 0.01 ? 'marginal-positive' : (deltaProb < -0.01 ? 'marginal-negative' : '');
        const cardsClass = deltaCards > 0.001 ? 'marginal-positive' : (deltaCards < -0.001 ? 'marginal-negative' : '');

        tableHTML += `
            <tr class="${rowClass}">
                <td>${x}</td>
                <td>${formatPercentage(r.prob4Plus)}</td>
                <td class="${probClass}">
                    ${isBaseline ? '-' : (deltaProb >= 0 ? '+' : '') + deltaProb.toFixed(1) + '%'}
                </td>
                <td>${formatNumber(r.expectedCards)}</td>
                <td class="${cardsClass}">
                    ${isBaseline ? '-' : (deltaCards >= 0 ? '+' : '') + formatNumber(deltaCards)}
                </td>
            </tr>
        `;
    });

    document.getElementById('portent-comparisonTable').innerHTML = tableHTML;
}

/**
 * Update all UI elements
 */
export function updateUI() {
    const { config, results } = calculate();

    if (config.deckSize === 0 || Object.keys(results).length === 0) {
        if (chart) chart.destroy();
        document.getElementById('portent-comparisonTable').innerHTML = '';
        return;
    }

    updateChart(config, results);
    updateTable(config, results);
}

/**
 * Update deck inputs from imported data
 * @param {Object} typeCounts - Type counts from import
 */
export function updateFromImport(typeCounts) {
    document.getElementById('portent-creatures').value = typeCounts.creature;
    document.getElementById('portent-instants').value = typeCounts.instant;
    document.getElementById('portent-sorceries').value = typeCounts.sorcery;
    document.getElementById('portent-artifacts').value = typeCounts.artifact;
    document.getElementById('portent-enchantments').value = typeCounts.enchantment;
    document.getElementById('portent-planeswalkers').value = typeCounts.planeswalker;
    document.getElementById('portent-lands').value = typeCounts.land;
    document.getElementById('portent-battles').value = typeCounts.battle;
}
