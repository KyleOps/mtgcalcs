/**
 * Land Drop Calculator
 * Calculates average turn for missing land drop and opening hand land distribution
 */

import { drawType, drawTypeMin } from '../utils/hypergeometric.js';
import { formatNumber, formatPercentage, createCache, getChartAnimationConfig } from '../utils/simulation.js';
import * as DeckConfig from '../utils/deckConfig.js';

let simulationCache = createCache(100);
let lastDeckHash = '';
let openingHandChart = null;
let landDropChart = null;

/**
 * Calculate probability of drawing new lands by a given turn
 * @param {number} deckSize - Total deck size
 * @param {number} landCount - Number of lands in deck
 * @param {number} turn - Turn number
 * @returns {number} - Probability of having enough lands
 */
function newLands(deckSize, landCount, turn) {
    // By turn N, you've drawn turn + 7 cards (7 opening hand + turn draws)
    const cardsDrawn = turn + 7;
    // Need at least turn lands to make every drop
    return 1 - drawTypeMin(deckSize, landCount, cardsDrawn, turn);
}

/**
 * Calculate the median turn for missing a land drop
 * @param {number} deckSize - Total deck size
 * @param {number} landCount - Number of lands in deck
 * @returns {number} - Expected turn for missing land drop
 */
export function calculateLandDropMiss(deckSize, landCount) {
    const cacheKey = `miss-${deckSize}-${landCount}`;
    const cached = simulationCache.get(cacheKey);
    if (cached) return cached;

    if (landCount === 0) return 1;
    if (landCount >= deckSize) return Infinity;

    // Find the turn where probability of missing crosses 50%
    for (let turn = 1; turn <= 10; turn++) {
        const missProbability = newLands(deckSize, landCount, turn);
        if (missProbability > 0.5) {
            simulationCache.set(cacheKey, turn);
            return turn;
        }
    }

    // Fallback formula for late misses
    const result = Math.round(7 / (1 - landCount / deckSize));
    simulationCache.set(cacheKey, result);
    return result;
}

/**
 * Calculate distribution of lands in opening hand
 * @param {number} deckSize - Total deck size
 * @param {number} landCount - Number of lands in deck
 * @returns {Object} - Distribution and median
 */
export function calculateOpeningHands(deckSize, landCount) {
    const cacheKey = `opening-${deckSize}-${landCount}`;
    const cached = simulationCache.get(cacheKey);
    if (cached) return cached;

    const distribution = [];
    let cumulative = 0;
    let median = 0;

    // Calculate probability for 0-7 lands in opening 7-card hand
    for (let numLands = 0; numLands <= 7; numLands++) {
        const prob = drawType(deckSize, landCount, 7, numLands);
        distribution.push({ lands: numLands, probability: prob });

        cumulative += prob;
        if (median === 0 && cumulative >= 0.5) {
            median = numLands;
        }
    }

    const result = { distribution, median };
    simulationCache.set(cacheKey, result);
    return result;
}

/**
 * Calculate land drop probabilities by turn
 * @param {number} deckSize - Total deck size
 * @param {number} landCount - Number of lands in deck
 * @returns {Array} - Array of {turn, probability} objects
 */
export function calculateLandDropByTurn(deckSize, landCount) {
    const cacheKey = `landdrops-${deckSize}-${landCount}`;
    const cached = simulationCache.get(cacheKey);
    if (cached) return cached;

    const results = [];

    for (let turn = 1; turn <= 10; turn++) {
        const missProbability = newLands(deckSize, landCount, turn);
        const makeProbability = 1 - missProbability;
        results.push({
            turn,
            makeProbability,
            missProbability
        });
    }

    simulationCache.set(cacheKey, results);
    return results;
}

/**
 * Get current deck configuration
 * @returns {Object} - Deck configuration
 */
export function getDeckConfig() {
    const config = DeckConfig.getDeckConfig();
    const deckSize = config.creatures + config.instants + config.sorceries +
                    config.artifacts + config.enchantments + config.planeswalkers +
                    config.lands + config.battles;
    const landCount = config.lands;

    // Clear cache if deck changed
    const newHash = `${deckSize}-${landCount}`;
    if (newHash !== lastDeckHash) {
        simulationCache.clear();
        lastDeckHash = newHash;
    }

    return { deckSize, landCount };
}

/**
 * Calculate all results
 * @returns {Object} - All calculation results
 */
export function calculate() {
    const config = getDeckConfig();

    if (config.deckSize === 0 || config.landCount === 0) {
        return { config, openingHands: null, landDropMiss: null, landDropByTurn: null };
    }

    const openingHands = calculateOpeningHands(config.deckSize, config.landCount);
    const landDropMiss = calculateLandDropMiss(config.deckSize, config.landCount);
    const landDropByTurn = calculateLandDropByTurn(config.deckSize, config.landCount);

    return { config, openingHands, landDropMiss, landDropByTurn };
}

/**
 * Update opening hand chart
 */
function updateOpeningHandChart(config, openingHands) {
    const labels = openingHands.distribution.map(d => `${d.lands} land${d.lands !== 1 ? 's' : ''}`);
    const data = openingHands.distribution.map(d => d.probability * 100);
    const backgroundColors = openingHands.distribution.map(d =>
        d.lands === openingHands.median ? 'rgba(74, 222, 128, 0.8)' : 'rgba(74, 222, 128, 0.4)'
    );

    if (!openingHandChart) {
        openingHandChart = new Chart(document.getElementById('lands-opening-chart'), {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Probability (%)',
                    data,
                    backgroundColor: backgroundColors,
                    borderColor: '#4ade80',
                    borderWidth: 2
                }]
            },
            options: {
                ...getChartAnimationConfig(),
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => `Probability: ${ctx.parsed.y.toFixed(2)}%`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: { display: true, text: 'Probability (%)', color: '#4ade80' },
                        grid: { color: 'rgba(34, 197, 94, 0.2)' },
                        ticks: { color: '#4ade80' }
                    },
                    x: {
                        grid: { color: 'rgba(34, 197, 94, 0.2)' },
                        ticks: { color: '#a09090' }
                    }
                }
            }
        });
    } else {
        openingHandChart.data.labels = labels;
        openingHandChart.data.datasets[0].data = data;
        openingHandChart.data.datasets[0].backgroundColor = backgroundColors;
        openingHandChart.update();
    }
}

/**
 * Update land drop by turn chart
 */
function updateLandDropChart(config, landDropByTurn, landDropMiss) {
    const labels = landDropByTurn.map(d => `Turn ${d.turn}`);
    const makeData = landDropByTurn.map(d => d.makeProbability * 100);
    const missData = landDropByTurn.map(d => d.missProbability * 100);

    if (!landDropChart) {
        landDropChart = new Chart(document.getElementById('lands-landdrop-chart'), {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Make Land Drop',
                        data: makeData,
                        borderColor: '#4ade80',
                        backgroundColor: 'rgba(74, 222, 128, 0.1)',
                        fill: false,
                        tension: 0.3,
                        pointRadius: landDropByTurn.map(d => d.turn === landDropMiss ? 8 : 4),
                        pointBackgroundColor: landDropByTurn.map(d => d.turn === landDropMiss ? '#fff' : '#4ade80')
                    },
                    {
                        label: 'Miss Land Drop',
                        data: missData,
                        borderColor: '#dc2626',
                        backgroundColor: 'rgba(220, 38, 38, 0.1)',
                        fill: false,
                        tension: 0.3,
                        pointRadius: landDropByTurn.map(d => d.turn === landDropMiss ? 8 : 4),
                        pointBackgroundColor: landDropByTurn.map(d => d.turn === landDropMiss ? '#fff' : '#dc2626')
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
                                const label = ctx.dataset.label;
                                return `${label}: ${ctx.parsed.y.toFixed(1)}%`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: { display: true, text: 'Probability (%)', color: '#4ade80' },
                        grid: { color: 'rgba(34, 197, 94, 0.2)' },
                        ticks: { color: '#4ade80' }
                    },
                    x: {
                        grid: { color: 'rgba(34, 197, 94, 0.2)' },
                        ticks: { color: '#a09090' }
                    }
                }
            }
        });
    } else {
        landDropChart.data.labels = labels;
        landDropChart.data.datasets[0].data = makeData;
        landDropChart.data.datasets[0].pointRadius = landDropByTurn.map(d => d.turn === landDropMiss ? 8 : 4);
        landDropChart.data.datasets[0].pointBackgroundColor = landDropByTurn.map(d => d.turn === landDropMiss ? '#fff' : '#4ade80');
        landDropChart.data.datasets[1].data = missData;
        landDropChart.data.datasets[1].pointRadius = landDropByTurn.map(d => d.turn === landDropMiss ? 8 : 4);
        landDropChart.data.datasets[1].pointBackgroundColor = landDropByTurn.map(d => d.turn === landDropMiss ? '#fff' : '#dc2626');
        landDropChart.update();
    }
}

/**
 * Update stats table
 */
function updateStatsTable(config, openingHands, landDropMiss, landDropByTurn) {
    const expectedTurn = landDropMiss === Infinity ? 'Never' : `Turn ${landDropMiss}`;
    const medianLands = openingHands.median;

    let tableHTML = `
        <tr>
            <th>Metric</th>
            <th>Value</th>
        </tr>
        <tr>
            <td>Deck Size</td>
            <td>${config.deckSize}</td>
        </tr>
        <tr>
            <td>Lands in Deck</td>
            <td>${config.landCount} (${((config.landCount / config.deckSize) * 100).toFixed(1)}%)</td>
        </tr>
        <tr class="current">
            <td>Expected Land Drop Miss</td>
            <td>${expectedTurn}</td>
        </tr>
        <tr class="current">
            <td>Median Opening Hand Lands</td>
            <td>${medianLands}</td>
        </tr>
        <tr>
            <td>P(2-4 lands in opener)</td>
            <td>${formatPercentage(openingHands.distribution.slice(2, 5).reduce((sum, d) => sum + d.probability, 0))}</td>
        </tr>
        <tr>
            <td>P(Make Turn 3 Drop)</td>
            <td>${formatPercentage(landDropByTurn[2].makeProbability)}</td>
        </tr>
    `;

    document.getElementById('lands-statsTable').innerHTML = tableHTML;
}

/**
 * Update all UI elements
 */
export function updateUI() {
    const { config, openingHands, landDropMiss, landDropByTurn } = calculate();

    if (!openingHands || !landDropByTurn) {
        if (openingHandChart) openingHandChart.destroy();
        if (landDropChart) landDropChart.destroy();
        document.getElementById('lands-statsTable').innerHTML = '<tr><td>Configure deck with lands to see results</td></tr>';
        return;
    }

    updateOpeningHandChart(config, openingHands);
    updateLandDropChart(config, landDropByTurn, landDropMiss);
    updateStatsTable(config, openingHands, landDropMiss, landDropByTurn);
}
