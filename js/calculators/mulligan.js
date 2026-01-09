/**
 * Mulligan Strategy Calculator
 * Determines optimal mulligan decisions for any number of card types
 */

import { drawType, drawTypeMin, drawTwoTypeMin, drawThreeTypeMin } from '../utils/hypergeometric.js';
import { formatNumber, formatPercentage, createCache } from '../utils/simulation.js';
import { createOrUpdateChart } from '../utils/chartHelpers.js';
import * as DeckConfig from '../utils/deckConfig.js';

let simulationCache = createCache(100);
let lastConfigHash = '';
let chart = null;
let turnChart = null;

// Card type management
let cardTypes = [
    { id: 1, name: 'Lands', count: 36, required: 2, byTurn: 3 }
];
let nextTypeId = 2;

/**
 * Helper: Calculate binomial coefficient
 */
function choose(n, k) {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    k = Math.min(k, n - k);
    let result = 1;
    for (let i = 0; i < k; i++) {
        result *= (n - i);
        result /= (i + 1);
    }
    return result;
}

/**
 * Calculate probability of drawing specific combination of multiple types
 */
function multiTypeProb(deckSize, typeCounts, drawn, typeDrawn) {
    const numTypes = typeCounts.length;
    const totalDrawn = typeDrawn.reduce((sum, n) => sum + n, 0);

    if (totalDrawn > drawn) return 0;

    const othersTotal = deckSize - typeCounts.reduce((sum, n) => sum + n, 0);
    const othersDrawn = drawn - totalDrawn;

    if (othersDrawn < 0 || othersDrawn > othersTotal) return 0;

    let numerator = choose(othersTotal, othersDrawn);
    for (let i = 0; i < numTypes; i++) {
        numerator *= choose(typeCounts[i], typeDrawn[i]);
    }

    const denominator = choose(deckSize, drawn);
    return numerator / denominator;
}

/**
 * Calculate success probability for a multi-type hand
 */
function calcMultiTypeSuccess(deckSize, types, handCounts) {
    const cardsInDeck = deckSize - 7;

    // Find the maximum turn we need to satisfy
    const maxTurn = Math.max(...types.map(t => t.byTurn));
    const cardsToDraw = maxTurn;

    if (cardsToDraw === 0) {
        // Check if we already have what we need
        return types.every((type, i) => handCounts[i] >= type.required) ? 1 : 0;
    }

    // Calculate remaining needs and deck composition
    const needs = types.map((type, i) => Math.max(0, type.required - handCounts[i]));
    const inDeck = types.map((type, i) => type.count - handCounts[i]);

    // Check if already satisfied
    if (needs.every(n => n === 0)) return 1;

    // Use recursive probability calculation for multiple types
    return calcMultiTypeSuccessRecursive(cardsInDeck, inDeck, cardsToDraw, needs, 0, []);
}

/**
 * Recursively calculate multi-type success probability
 */
function calcMultiTypeSuccessRecursive(deckSize, typesInDeck, cardsToDraw, needs, typeIndex, currentDrawn) {
    if (typeIndex === typesInDeck.length) {
        // Base case: calculate probability for this combination
        const totalDrawn = currentDrawn.reduce((sum, n) => sum + n, 0);
        if (totalDrawn > cardsToDraw) return 0;

        const othersInDeck = deckSize - typesInDeck.reduce((sum, n) => sum + n, 0);
        const othersDrawn = cardsToDraw - totalDrawn;

        if (othersDrawn < 0 || othersDrawn > othersInDeck) return 0;

        let prob = choose(othersInDeck, othersDrawn);
        for (let i = 0; i < typesInDeck.length; i++) {
            prob *= choose(typesInDeck[i], currentDrawn[i]);
        }
        prob /= choose(deckSize, cardsToDraw);

        return prob;
    }

    // Recursive case: sum over all possible draws for this type
    let totalProb = 0;
    const minDraw = needs[typeIndex];
    const maxDraw = Math.min(typesInDeck[typeIndex], cardsToDraw);

    for (let draw = minDraw; draw <= maxDraw; draw++) {
        totalProb += calcMultiTypeSuccessRecursive(
            deckSize, typesInDeck, cardsToDraw, needs,
            typeIndex + 1, [...currentDrawn, draw]
        );
    }

    return totalProb;
}

/**
 * Calculate mulligan strategy for multiple card types
 */
function mullStratMultiType(deckSize, types, penalty, freeMulligan = false) {
    const strategy = [];
    let bestKeepProb = 0;

    // Generate all possible hand combinations
    function generateHandCombinations(typeIndex, currentCombination, remainingCards) {
        if (typeIndex === types.length) {
            if (currentCombination.reduce((sum, n) => sum + n, 0) <= 7) {
                // Calculate hand probability
                const handProb = multiTypeProb(
                    deckSize,
                    types.map(t => t.count),
                    7,
                    currentCombination
                );

                if (handProb > 0) {
                    const successProb = calcMultiTypeSuccess(deckSize, types, currentCombination);

                    strategy.push({
                        counts: [...currentCombination],
                        handProb,
                        successProb,
                        keep: false
                    });

                    if (successProb > bestKeepProb) {
                        bestKeepProb = successProb;
                    }
                }
            }
            return;
        }

        const maxForType = Math.min(types[typeIndex].count, remainingCards);
        for (let count = 0; count <= maxForType; count++) {
            generateHandCombinations(
                typeIndex + 1,
                [...currentCombination, count],
                remainingCards - count
            );
        }
    }

    generateHandCombinations(0, [], 7);

    // Determine optimal strategy
    // For free mulligan: first mulligan has no penalty, subsequent ones do
    // For non-free: all mulligans have penalty
    const threshold = bestKeepProb * (1 - penalty);
    let expectedSuccess = 0;

    strategy.forEach(hand => {
        hand.keep = hand.successProb >= threshold;
        if (hand.keep) {
            expectedSuccess += hand.handProb * hand.successProb;
        }
    });

    const mulliganProb = 1 - strategy.filter(h => h.keep).reduce((sum, h) => sum + h.handProb, 0);
    
    // Calculate the expected value of a round where mulligans are penalized
    // This represents the value of "Mulliganing to 6" (heuristic)
    const penalizedOutcome = bestKeepProb * (1 - penalty);
    const evPenalized = expectedSuccess + mulliganProb * penalizedOutcome;

    // After mulligan, we get...
    if (freeMulligan) {
        // First mulligan is free. If we mulligan, we get the value of a fresh 7 (which will be penalized if mulled again).
        // That value is exactly evPenalized.
        expectedSuccess += mulliganProb * evPenalized;
    } else {
        // No free mulligan. Value is the penalized round value.
        expectedSuccess = evPenalized;
    }

    return { strategy, expectedSuccess, threshold, bestKeepProb };
}

/**
 * Calculate marginal benefit of adding one more card of each type
 */
function calculateMarginalBenefits(deckSize, types, penalty, freeMulligan) {
    const baseResult = mullStratMultiType(deckSize, types, penalty, freeMulligan);
    const baseBaseline = calculateNoMulliganSuccess(deckSize, types);
    const benefits = [];

    types.forEach((type, index) => {
        const modifiedTypes = types.map((t, i) =>
            i === index ? { ...t, count: t.count + 1 } : t
        );
        const modifiedResult = mullStratMultiType(deckSize + 1, modifiedTypes, penalty, freeMulligan);
        const modifiedBaseline = calculateNoMulliganSuccess(deckSize + 1, modifiedTypes);
        
        benefits.push({
            overall: modifiedResult.expectedSuccess - baseResult.expectedSuccess,
            baseline: modifiedBaseline - baseBaseline
        });
    });

    return benefits;
}

/**
 * Calculate average number of mulligans and expected cards in hand
 */
function calculateAvgMulligans(strategy, penalty, freeMulligan) {
    const keepProb = strategy.filter(h => h.keep).reduce((sum, h) => sum + h.handProb, 0);
    // Geometric distribution: E[mulligans] = (1-p) / p where p is keep probability
    const avgMulligans = keepProb > 0 ? (1 - keepProb) / keepProb : 0;

    // Expected cards in hand calculation
    let expectedCards = 0;
    
    // Calculate weighted average of cards kept
    // P(Keep 0 mulls) * 7
    // P(Keep 1 mull) * (free ? 7 : 6)
    // P(Keep 2 mulls) * (free ? 6 : 5)
    // ...
    
    let remainingProb = 1.0;
    let currentCards = 7;
    let mulliganCount = 0;
    let accumulatedProb = 0;
    
    // Sum the first 10 mulligan layers (sufficient precision)
    for (let i = 0; i < 10; i++) {
        // Probability of keeping at this stage
        const pKeepHere = remainingProb * keepProb;
        
        // Cards we have if we keep here
        let cardsIfKeep = 7;
        if (mulliganCount > 0) {
            if (freeMulligan) {
                cardsIfKeep = 7 - (mulliganCount - 1);
            } else {
                cardsIfKeep = 7 - mulliganCount;
            }
        }
        // Cap at 0 cards
        cardsIfKeep = Math.max(0, cardsIfKeep);
        
        expectedCards += pKeepHere * cardsIfKeep;
        accumulatedProb += pKeepHere;
        
        // Advance to next mulligan
        remainingProb *= (1 - keepProb);
        mulliganCount++;
        
        if (remainingProb < 0.0001) break;
    }
    
    // Normalize if we didn't reach 100% (truncation)
    if (accumulatedProb > 0) {
        expectedCards = expectedCards / accumulatedProb;
    }

    return { avgMulligans, expectedCards };
}

/**
 * Calculate success rate without any mulligans (baseline)
 */
function calculateNoMulliganSuccess(deckSize, types) {
    const allHands = [];

    function generateHandCombinations(typeIndex, currentCombination, remainingCards) {
        if (typeIndex === types.length) {
            if (currentCombination.reduce((sum, n) => sum + n, 0) <= 7) {
                const handProb = multiTypeProb(
                    deckSize,
                    types.map(t => t.count),
                    7,
                    currentCombination
                );

                if (handProb > 0) {
                    const successProb = calcMultiTypeSuccess(deckSize, types, currentCombination);
                    allHands.push({ handProb, successProb });
                }
            }
            return;
        }

        const maxForType = Math.min(types[typeIndex].count, remainingCards);
        for (let count = 0; count <= maxForType; count++) {
            generateHandCombinations(
                typeIndex + 1,
                [...currentCombination, count],
                remainingCards - count
            );
        }
    }

    generateHandCombinations(0, [], 7);

    // Weighted average of success probability across all possible hands
    return allHands.reduce((sum, hand) => sum + hand.handProb * hand.successProb, 0);
}

/**
 * Get current configuration from UI
 */
export function getDeckConfig() {
    const config = DeckConfig.getDeckConfig();
    const deckSize = config.creatures + config.instants + config.sorceries +
                    config.artifacts + config.enchantments + config.planeswalkers +
                    config.lands + config.battles;

    const penalty = parseFloat(document.getElementById('mull-penalty')?.value || 0.2);
    const freeMulligan = document.getElementById('mull-free')?.checked === true;

    // Clear cache if config changed
    const newHash = `${deckSize}-${JSON.stringify(cardTypes)}-${penalty}-${freeMulligan}`;
    if (newHash !== lastConfigHash) {
        simulationCache.clear();
        lastConfigHash = newHash;
    }

    return {
        deckSize,
        penalty,
        freeMulligan,
        types: cardTypes
    };
}

/**
 * Calculate optimal strategy
 */
export function calculate() {
    const config = getDeckConfig();

    if (config.deckSize === 0 || config.types.length === 0) {
        return { config, result: null };
    }

    const cacheKey = `${config.deckSize}-${JSON.stringify(config.types)}-${config.penalty}-${config.freeMulligan}`;
    const cached = simulationCache.get(cacheKey);
    if (cached) {
        return { config, result: cached };
    }

    const result = mullStratMultiType(config.deckSize, config.types, config.penalty, config.freeMulligan);
    const mulliganStats = calculateAvgMulligans(result.strategy, config.penalty, config.freeMulligan);
    result.avgMulligans = mulliganStats.avgMulligans;
    result.expectedCards = mulliganStats.expectedCards;
    result.baselineSuccess = calculateNoMulliganSuccess(config.deckSize, config.types);
    result.marginalBenefits = calculateMarginalBenefits(config.deckSize, config.types, config.penalty, config.freeMulligan);

    simulationCache.set(cacheKey, result);
    return { config, result };
}

/**
 * Render card type inputs
 */
function renderCardTypes() {
    const container = document.getElementById('mull-types-container');
    if (!container) return;

    container.innerHTML = cardTypes.map((type, index) => `
        <div class="card-type-row" data-type-id="${type.id}">
            <div class="type-header">
                <input type="text"
                       class="type-name-input"
                       value="${type.name}"
                       placeholder="Type name"
                       data-type-id="${type.id}">
                ${cardTypes.length > 1 ? `<button class="remove-type-btn" data-type-id="${type.id}" aria-label="Remove type">✕</button>` : ''}
            </div>
            <div class="type-grid">
                <div class="type-input">
                    <label>Cards in Deck</label>
                    <input type="number"
                           class="type-count"
                           value="${type.count}"
                           min="0"
                           data-type-id="${type.id}">
                </div>
                <div class="type-input">
                    <label>Need in Hand</label>
                    <input type="number"
                           class="type-required"
                           value="${type.required}"
                           min="0"
                           max="7"
                           data-type-id="${type.id}">
                </div>
                <div class="type-input">
                    <label>By Turn</label>
                    <input type="number"
                           class="type-turn"
                           value="${type.byTurn}"
                           min="1"
                           max="10"
                           data-type-id="${type.id}">
                </div>
            </div>
        </div>
    `).join('');

    // Add event listeners
    container.querySelectorAll('.type-name-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const id = parseInt(e.target.dataset.typeId);
            const type = cardTypes.find(t => t.id === id);
            if (type) {
                type.name = e.target.value;
                updateUI();
            }
        });
    });

    container.querySelectorAll('.type-count').forEach(input => {
        input.addEventListener('input', (e) => {
            const id = parseInt(e.target.dataset.typeId);
            const type = cardTypes.find(t => t.id === id);
            if (type) {
                type.count = parseInt(e.target.value) || 0;
                updateUI();
            }
        });
    });

    container.querySelectorAll('.type-required').forEach(input => {
        input.addEventListener('input', (e) => {
            const id = parseInt(e.target.dataset.typeId);
            const type = cardTypes.find(t => t.id === id);
            if (type) {
                type.required = parseInt(e.target.value) || 0;
                updateUI();
            }
        });
    });

    container.querySelectorAll('.type-turn').forEach(input => {
        input.addEventListener('input', (e) => {
            const id = parseInt(e.target.dataset.typeId);
            const type = cardTypes.find(t => t.id === id);
            if (type) {
                type.byTurn = parseInt(e.target.value) || 1;
                updateUI();
            }
        });
    });

    container.querySelectorAll('.remove-type-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = parseInt(e.target.dataset.typeId);
            cardTypes = cardTypes.filter(t => t.id !== id);
            renderCardTypes();
            updateUI();
        });
    });
}

/**
 * Add new card type
 */
function addCardType() {
    cardTypes.push({
        id: nextTypeId++,
        name: `Type ${cardTypes.length + 1}`,
        count: 0,
        required: 1,
        byTurn: 3
    });
    renderCardTypes();
    updateUI();
}

/**
 * Update strategy table
 */
function updateStrategyTable(config, result) {
    const tableEl = document.getElementById('mull-strategyTable');
    if (!tableEl) return;

    // Single Type Case - Simplified Table
    if (config.types.length === 1) {
        const typeName = config.types[0].name;
        // Sort by count descending
        const rows = result.strategy.sort((a, b) => b.counts[0] - a.counts[0]);

        let tableHTML = `
            <tr>
                <th>${typeName} Count</th>
                <th>Decision</th>
                <th>Success Rate</th>
                <th>Hand %</th>
            </tr>
        `;

        rows.forEach(hand => {
            const count = hand.counts[0];
            const decision = hand.keep ? 'Keep' : 'Mulligan';
            const decisionClass = hand.keep ? 'marginal-positive' : 'marginal-negative';
            const rowClass = hand.keep ? '' : 'marginal-negative';
            
            // Only show rows where hand probability is relevant (>0.01%) or it's a keep
            if (hand.handProb < 0.0001 && !hand.keep) return;

            tableHTML += `
                <tr class="${rowClass}">
                    <td><strong>${count}</strong></td>
                    <td class="${decisionClass}" style="font-weight:bold;">${decision}</td>
                    <td>${formatPercentage(hand.successProb)}</td>
                    <td style="color:var(--text-dim); font-size:0.9em;">${formatPercentage(hand.handProb)}</td>
                </tr>
            `;
        });
        tableEl.innerHTML = tableHTML;
        return;
    }

    // Multi-Type Case: Group hands by decision for cleaner display
    const keepHands = result.strategy.filter(h => h.keep).sort((a, b) => b.successProb - a.successProb);
    const mulliganHands = result.strategy.filter(h => !h.keep).sort((a, b) => b.handProb - a.handProb);

    const headerRow = `
        <tr>
            ${config.types.map(t => `<th>${t.name}</th>`).join('')}
            <th>Hand %</th>
            <th>Success %</th>
            <th>Decision</th>
        </tr>
    `;

    const renderHand = (hand) => {
        const decision = hand.keep ? '✓ Keep' : '✗ Mulligan';
        const rowClass = hand.keep ? '' : 'marginal-negative';
        const decisionClass = hand.keep ? 'marginal-positive' : 'marginal-negative';

        // Build explanation of what you need to draw
        const needs = config.types.map((type, i) => {
            const have = hand.counts[i];
            const need = type.required;
            if (have >= need) return null;
            return `${need - have} more ${type.name}`;
        }).filter(x => x);

        const needsText = needs.length > 0
            ? `Need: ${needs.join(' + ')}`
            : 'Already have everything!';

        return `
            <tr class="${rowClass}" title="${needsText}">
                ${hand.counts.map(c => `<td>${c}</td>`).join('')}
                <td>${formatPercentage(hand.handProb)}</td>
                <td title="${needsText}">${formatPercentage(hand.successProb)}</td>
                <td class="${decisionClass}">${decision}</td>
            </tr>
        `;
    };

    // Show top keeps and top mulligans
    const topKeeps = keepHands.slice(0, 10);
    const topMulligans = mulliganHands.slice(0, 5);

    let tableHTML = headerRow;

    if (topKeeps.length > 0) {
        tableHTML += `<tr class="section-header"><td colspan="${config.types.length + 3}" style="background:var(--panel-bg-alt); color:var(--text-secondary); font-size:0.9em; padding:8px;"><strong>Top Hands to Keep</strong></td></tr>`;
        tableHTML += topKeeps.map(renderHand).join('');
    }

    if (topMulligans.length > 0) {
        tableHTML += `<tr class="section-header"><td colspan="${config.types.length + 3}" style="background:var(--panel-bg-alt); color:var(--text-secondary); font-size:0.9em; padding:8px;"><strong>Sample Hands to Mulligan</strong></td></tr>`;
        tableHTML += topMulligans.map(renderHand).join('');
    }

    tableEl.innerHTML = tableHTML;
}

/**
 * Calculate mulligan breakdown (probability of each mulligan)
 */
function calculateMulliganBreakdown(strategy, freeMulligan, bestKeepProb) {
    const keepProb = strategy.filter(h => h.keep).reduce((sum, h) => sum + h.handProb, 0);
    const mullProb = 1 - keepProb;

    const breakdown = [];
    let cumulativeKeepProb = 0;

    // Opening hand (7 cards, keep 7) - success rate is the weighted average of kept hands
    const openingSuccess = bestKeepProb;
    breakdown.push({
        label: 'Opening hand (7 cards)',
        keepProbability: keepProb,
        drawRate: keepProb, // Probability of drawing into requirements with this hand
        takeProbability: 1.0, // Always get an opening hand
        cumulative: keepProb,
        successRate: openingSuccess
    });
    cumulativeKeepProb = keepProb;

    // Each subsequent mulligan
    let takeProbability = mullProb; // Probability we take this mulligan
    for (let i = 1; i <= 4 && takeProbability > 0.001; i++) {
        const thisKeepProb = takeProbability * keepProb; // Probability we keep after taking this mulligan
        cumulativeKeepProb += thisKeepProb;

        let label;
        let successRate;
        let drawRate; // Probability of drawing into requirements with this mulligan's hand size

        if (i === 1 && freeMulligan) {
            // First mulligan is free: see 7, keep 7 - same success rate as opening hand
            label = `Mulligan ${i} - Free (see 7, keep 7)`;
            successRate = openingSuccess;
            drawRate = keepProb; // Same as opening hand (7 cards)
        } else if (freeMulligan) {
            // Subsequent mulligans after free: see 7, keep 7-(i-1) because first was free
            const cards = 7 - (i - 1);
            label = `Mulligan ${i} (see 7, keep ${cards})`;
            // Calculate penalty based on cards lost (each card lost reduces success by roughly the penalty amount)
            successRate = openingSuccess * Math.pow(1 - (1/7), i - 1);
            drawRate = keepProb * Math.pow(1 - (1/7), i - 1); // Decreases with fewer cards
        } else {
            // No free mulligan: see 7, keep 7-i
            const cards = 7 - i;
            label = `Mulligan ${i} (see 7, keep ${cards})`;
            // Calculate penalty based on cards lost
            successRate = openingSuccess * Math.pow(1 - (1/7), i);
            drawRate = keepProb * Math.pow(1 - (1/7), i); // Decreases with fewer cards
        }

        breakdown.push({
            label,
            keepProbability: thisKeepProb,
            drawRate, // Probability of hitting requirements with this hand size
            takeProbability,
            cumulative: cumulativeKeepProb,
            successRate
        });

        takeProbability *= mullProb; // Next mulligan requires mulliganing again
    }

    return breakdown;
}

/**
 * Update summary stats with clearer explanations
 */
function updateSummary(config, result) {
    const summaryEl = document.getElementById('mull-summary');
    if (!summaryEl) return;

    // Calculate improvement from mulligan strategy
    const improvement = result.expectedSuccess - result.baselineSuccess;

    // Calculate mulligan breakdown for detail view
    const mulliganBreakdown = calculateMulliganBreakdown(result.strategy, config.freeMulligan, result.bestKeepProb);
    
    const breakdownHTML = mulliganBreakdown.map(m => `
        <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.9em;">
            <span style="color: var(--text-secondary);">${m.label}</span>
            <span style="color: var(--text-light);">${formatPercentage(m.cumulative)}</span>
        </div>
    `).join('');

    summaryEl.innerHTML = `
        <div style="text-align: center; margin-bottom: 24px; padding: 20px; background: linear-gradient(135deg, rgba(192, 132, 252, 0.1) 0%, rgba(10, 10, 18, 0) 100%); border-radius: 12px; border: 1px solid rgba(192, 132, 252, 0.2);">
            <div style="font-size: 0.85em; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">Overall Success Rate</div>
            <div style="font-size: 3.5em; font-weight: 700; color: #c084fc; line-height: 1; text-shadow: 0 0 20px rgba(192, 132, 252, 0.3);">
                ${formatPercentage(result.expectedSuccess)}
            </div>
            <div style="color: var(--text-dim); font-size: 0.9em; margin-top: 8px;">
                (${formatPercentage(result.baselineSuccess)} without mulligans)
            </div>
        </div>

        <div style="background: var(--panel-bg-alt); border-radius: 8px; padding: 16px; margin-bottom: 20px;">
            <div style="margin-bottom: 12px; color: var(--text-secondary); font-size: 0.95em; line-height: 1.5;">
                This strategy mulligans <strong>${formatNumber(result.avgMulligans, 2)}</strong> times on average, 
                starting with an average of <strong>${formatNumber(result.expectedCards, 2)}</strong> cards.
            </div>
            
            <details>
                <summary style="cursor: pointer; color: var(--text-dim); font-size: 0.85em;">View Mulligan Breakdown</summary>
                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-color);">
                    ${breakdownHTML}
                </div>
            </details>
        </div>

        <div style="background: rgba(34, 197, 94, 0.05); border: 1px solid rgba(34, 197, 94, 0.2); border-radius: 8px; padding: 16px;">
            <h3 style="margin: 0 0 12px 0; font-size: 0.95em; color: #4ade80; text-transform: uppercase; letter-spacing: 0.5px;">💡 Marginal Value (Impact on Overall Success)</h3>
            <ul style="margin: 0; padding-left: 20px; color: var(--text-secondary); font-size: 0.9em; line-height: 1.6;">
                ${result.marginalBenefits.map((benefit, i) => 
                    `<li>
                        Adding an extra <strong>${config.types[i].name}</strong>:
                        <div style="margin-left: 8px; font-size: 0.9em;">
                            • Overall Success: <strong style="color: #4ade80;">${formatPercentage(benefit.overall > 0 ? benefit.overall : 0, 2)}</strong><br>
                            • Natural Draw: <strong style="color: #a09090;">${formatPercentage(benefit.baseline > 0 ? benefit.baseline : 0, 2)}</strong>
                        </div>
                    </li>`
                ).join('')}
            </ul>
        </div>
    `;
}





/**
 * Update visualization charts
 */
function updateChart(config, result) {
    const mulliganCanvas = 'mull-chart';
    const turnCanvas = 'mull-turn-chart';

    if (!document.getElementById(mulliganCanvas)) return;

    // --- Mulligan Success Chart ---
    const mulliganBreakdown = calculateMulliganBreakdown(result.strategy, config.freeMulligan, result.bestKeepProb);
    const labels = mulliganBreakdown.map(m => {
        if (m.label.includes('Opening')) return 'Opening';
        const match = m.label.match(/Mulligan (\d+)/);
        return match ? `Mull ${match[1]}` : m.label;
    });

    const singleAttempt = mulliganBreakdown.map(m => m.keepProbability * 100);
    const cumulative = mulliganBreakdown.map(m => m.cumulative * 100);

    chart = createOrUpdateChart(chart, mulliganCanvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Single attempt',
                    data: singleAttempt,
                    backgroundColor: 'rgba(220, 38, 38, 0.8)',
                    borderColor: '#dc2626',
                    borderWidth: 1,
                    order: 2
                },
                {
                    label: 'Cumulative',
                    data: cumulative,
                    type: 'line',
                    borderColor: '#c084fc',
                    backgroundColor: 'rgba(192, 132, 252, 0.15)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 5,
                    pointBackgroundColor: '#c084fc',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    order: 1
                }
            ]
        },
        options: {
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#a09090',
                        font: { size: 11 },
                        padding: 15,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%`
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(192, 132, 252, 0.1)',
                        drawBorder: false
                    },
                    ticks: { color: '#a09090' },
                    title: {
                        display: true,
                        text: 'Mulligan',
                        color: '#a09090'
                    }
                },
                y: {
                    beginAtZero: true,
                    max: 100,
                    grid: {
                        color: 'rgba(192, 132, 252, 0.15)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#c084fc',
                        callback: value => value + '%'
                    },
                    title: {
                        display: true,
                        text: 'Probability',
                        color: '#c084fc'
                    }
                }
            }
        }
    });

    // --- Turn-by-Turn Chart ---
    if (!document.getElementById(turnCanvas)) return;

    // Calculate probability of meeting requirements by each turn
    const maxTurn = Math.max(...config.types.map(t => t.byTurn)) + 3;
    const turnData = [];

    for (let turn = 0; turn <= maxTurn; turn++) {
        const cardsSeen = 7 + turn;

        // For each type, calculate probability of meeting requirement by this turn
        const typeProbabilities = config.types.map((type, i) => {
            let prob = 0;
            for (let drawn = type.required; drawn <= Math.min(type.count, cardsSeen); drawn++) {
                prob += multiTypeProb(config.deckSize, [type.count], cardsSeen, [drawn]);
            }
            return prob;
        });

        // Combined probability (ALL requirements met)
        let combinedProb = 0;
        function generateCombinations(typeIndex, current, remaining) {
            if (typeIndex === config.types.length) {
                if (current.reduce((sum, n) => sum + n, 0) <= cardsSeen) {
                    const handProb = multiTypeProb(
                        config.deckSize,
                        config.types.map(t => t.count),
                        cardsSeen,
                        current
                    );
                    if (handProb > 0) {
                        const meetsReqs = config.types.every((type, i) => {
                            return current[i] >= type.required;
                        });
                        if (meetsReqs) {
                            combinedProb += handProb;
                        }
                    }
                }
                return;
            }
            const type = config.types[typeIndex];
            const maxForType = Math.min(type.count, remaining);
            for (let count = 0; count <= maxForType; count++) {
                generateCombinations(typeIndex + 1, [...current, count], remaining - count);
            }
        }
        generateCombinations(0, [], cardsSeen);

        turnData.push({ turn, typeProbabilities, combinedProb });
    }

    const colors = ['#a855f7', '#6b7280', '#c084fc'];
    const datasets = [];

    config.types.forEach((type, i) => {
        datasets.push({
            label: type.name,
            data: turnData.map(d => d.typeProbabilities[i] * 100),
            borderColor: colors[i % colors.length],
            backgroundColor: colors[i % colors.length] + '30',
            borderWidth: 2,
            fill: false,
            tension: 0.3,
            pointRadius: 3,
            pointBackgroundColor: colors[i % colors.length],
            borderDash: [5, 5]
        });
    });

    datasets.push({
        label: 'Combined (ALL)',
        data: turnData.map(d => d.combinedProb * 100),
        borderColor: '#c084fc',
        backgroundColor: 'rgba(192, 132, 252, 0.15)',
        borderWidth: 3,
        fill: true,
        tension: 0.3,
        pointRadius: 5,
        pointBackgroundColor: '#c084fc',
        pointBorderColor: '#fff',
        pointBorderWidth: 2
    });

    turnChart = createOrUpdateChart(turnChart, turnCanvas, {
        type: 'line',
        data: {
            labels: turnData.map(d => d.turn),
            datasets
        },
        options: {
            plugins: {
                title: {
                    display: true,
                    text: 'Natural Draw Probability (No Mulligan)',
                    color: '#a09090',
                    font: { size: 14, weight: 'normal' },
                    padding: { bottom: 15 }
                },
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#a09090',
                        font: { size: 11 },
                        padding: 12,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%`
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(192, 132, 252, 0.1)', drawBorder: false },
                    ticks: { color: '#a09090' },
                    title: { display: true, text: 'Turn', color: '#a09090' }
                },
                y: {
                    beginAtZero: true,
                    max: 100,
                    grid: { color: 'rgba(192, 132, 252, 0.15)', drawBorder: false },
                    ticks: { color: '#c084fc', callback: value => value + '%' },
                    title: { display: true, text: 'Probability', color: '#c084fc' }
                }
            }
        }
    });
}

/**
 * Update all UI elements
 */
export function updateUI() {
    const { config, result } = calculate();

    if (!result) {
        document.getElementById('mull-strategyTable').innerHTML = '<tr><td>Configure card types to see strategy</td></tr>';
        document.getElementById('mull-summary').innerHTML = '<p>Set up your card type requirements to calculate optimal mulligan strategy.</p>';
        return;
    }

    updateChart(config, result);
    updateStrategyTable(config, result);
    updateSummary(config, result);
}

/**
 * Initialize the mulligan calculator
 */
export function init() {
    // Render initial card types
    renderCardTypes();

    // Add type button
    const addBtn = document.getElementById('mull-add-type');
    if (addBtn) {
        addBtn.addEventListener('click', addCardType);
    }

    // Penalty slider
    const penaltySlider = document.getElementById('mull-penalty');
    const penaltyDisplay = document.getElementById('mull-penalty-display');
    if (penaltySlider && penaltyDisplay) {
        penaltySlider.addEventListener('input', () => {
            penaltyDisplay.textContent = (parseFloat(penaltySlider.value) * 100).toFixed(0) + '%';
            updateUI();
        });
    }

    // Free mulligan checkbox
    const freeCheckbox = document.getElementById('mull-free');
    if (freeCheckbox) {
        freeCheckbox.addEventListener('change', () => updateUI());
    }

    // Listen for deck configuration changes
    DeckConfig.onDeckUpdate(() => {
        updateUI();
    });

    updateUI();
}
