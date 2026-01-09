/**
 * Mulligan Strategy Calculator
 * Determines optimal mulligan decisions for any number of card types
 */

import { choose, drawTwoTypeMin, drawThreeTypeMin } from '../utils/hypergeometric.js';
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
 * Calculate cumulative probability: P(at least typeDrawn[i] of each type)
 * Optimized to use built-in hypergeometric functions for common cases
 */
function multiTypeProbCumulative(deckSize, typeCounts, drawn, typeDrawnMin) {
    // Fast path for common cases
    if (typeCounts.length === 2) {
        return drawTwoTypeMin(deckSize, typeCounts[0], typeCounts[1], drawn, typeDrawnMin[0], typeDrawnMin[1]);
    }
    if (typeCounts.length === 3) {
        return drawThreeTypeMin(deckSize, typeCounts[0], typeCounts[1], typeCounts[2], drawn, typeDrawnMin[0], typeDrawnMin[1], typeDrawnMin[2]);
    }

    // General case: enumerate all valid combinations
    let totalProb = 0;
    function enumerate(typeIndex, currentDrawn, remainingSlots) {
        if (typeIndex === typeCounts.length) {
            totalProb += multiTypeProb(deckSize, typeCounts, drawn, currentDrawn);
            return;
        }
        const minForType = typeDrawnMin[typeIndex];
        const maxForType = Math.min(typeCounts[typeIndex], remainingSlots);
        for (let count = minForType; count <= maxForType; count++) {
            enumerate(typeIndex + 1, [...currentDrawn, count], remainingSlots - count);
        }
    }
    enumerate(0, [], drawn);
    return totalProb;
}

/**
 * Calculate success probability for a multi-type hand
 */
function calcMultiTypeSuccess(deckSize, types, handCounts, onThePlay = false) {
    const cardsInDeck = deckSize - 7;

    // Find the maximum turn we need to satisfy
    const maxTurn = Math.max(...types.map(t => t.byTurn));
    
    // Calculate actual draws based on Play/Draw
    // On Draw: Turn 1 = 1 draw (Total 8 cards)
    // On Play: Turn 1 = 0 draws (Total 7 cards), Turn 2 = 1 draw
    const cardsToDraw = onThePlay ? Math.max(0, maxTurn - 1) : maxTurn;

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
function mullStratMultiType(deckSize, types, penalty, freeMulligan = false, onThePlay = false) {
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
                    const successProb = calcMultiTypeSuccess(deckSize, types, currentCombination, onThePlay);

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
function calculateMarginalBenefits(deckSize, types, penalty, freeMulligan, onThePlay) {
    const baseResult = mullStratMultiType(deckSize, types, penalty, freeMulligan, onThePlay);
    // Baseline = No Mulligan, just natural draw
    const baseBaseline = calculateNoMulliganSuccess(deckSize, types, onThePlay);
    const benefits = [];

    types.forEach((type, index) => {
        const modifiedTypes = types.map((t, i) =>
            i === index ? { ...t, count: t.count + 1 } : t
        );
        const modifiedResult = mullStratMultiType(deckSize + 1, modifiedTypes, penalty, freeMulligan, onThePlay);
        const modifiedBaseline = calculateNoMulliganSuccess(deckSize + 1, modifiedTypes, onThePlay);
        
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
function calculateNoMulliganSuccess(deckSize, types, onThePlay) {
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
                    const successProb = calcMultiTypeSuccess(deckSize, types, currentCombination, onThePlay);
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
    const onThePlay = document.getElementById('mull-on-play')?.checked === true;
    const confidenceThreshold = parseFloat(document.getElementById('mull-threshold')?.value || 85) / 100;

    // Clear cache if config changed
    const newHash = `${deckSize}-${JSON.stringify(cardTypes)}-${penalty}-${freeMulligan}-${onThePlay}-${confidenceThreshold}`;
    if (newHash !== lastConfigHash) {
        simulationCache.clear();
        lastConfigHash = newHash;
    }

    return {
        deckSize,
        penalty,
        freeMulligan,
        onThePlay,
        confidenceThreshold,
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

    const cacheKey = `${config.deckSize}-${JSON.stringify(config.types)}-${config.penalty}-${config.freeMulligan}-${config.onThePlay}`;
    const cached = simulationCache.get(cacheKey);
    let result = cached;

    if (!result) {
        result = mullStratMultiType(config.deckSize, config.types, config.penalty, config.freeMulligan, config.onThePlay);
        const mulliganStats = calculateAvgMulligans(result.strategy, config.penalty, config.freeMulligan);
        result.avgMulligans = mulliganStats.avgMulligans;
        result.expectedCards = mulliganStats.expectedCards;
        result.baselineSuccess = calculateNoMulliganSuccess(config.deckSize, config.types, config.onThePlay);
        result.marginalBenefits = calculateMarginalBenefits(config.deckSize, config.types, config.penalty, config.freeMulligan, config.onThePlay);
        simulationCache.set(cacheKey, result);
    }

    return { config, result };
}

/**
 * Render card type inputs
 */
function renderCardTypes() {
    const container = document.getElementById('mull-types-container');
    if (!container) return;

    container.innerHTML = cardTypes.map(t => `<div class="card-type-row" data-type-id="${t.id}">
        <div class="type-header">
            <input type="text" class="type-name-input" value="${t.name}" placeholder="Type name" data-type-id="${t.id}">
            ${cardTypes.length > 1 ? `<button class="remove-type-btn" data-type-id="${t.id}" aria-label="Remove type">✕</button>` : ''}
        </div>
        <div class="type-grid">
            <div class="type-input"><label>Cards in Deck</label><input type="number" class="type-count" value="${t.count}" min="0" data-type-id="${t.id}"></div>
            <div class="type-input"><label>Need in Hand</label><input type="number" class="type-required" value="${t.required}" min="0" max="7" data-type-id="${t.id}"></div>
            <div class="type-input"><label>By Turn</label><input type="number" class="type-turn" value="${t.byTurn}" min="1" max="10" data-type-id="${t.id}"></div>
        </div>
    </div>`).join('');

    // Unified event handler
    const updateType = (selector, field, parser = v => v) => {
        container.querySelectorAll(selector).forEach(input => {
            input.addEventListener('input', e => {
                const type = cardTypes.find(t => t.id === parseInt(e.target.dataset.typeId));
                if (type) {
                    type[field] = parser(e.target.value);
                    updateUI();
                }
            });
        });
    };

    updateType('.type-name-input', 'name');
    updateType('.type-count', 'count', v => parseInt(v) || 0);
    updateType('.type-required', 'required', v => parseInt(v) || 0);
    updateType('.type-turn', 'byTurn', v => parseInt(v) || 1);

    container.querySelectorAll('.remove-type-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            cardTypes = cardTypes.filter(t => t.id !== parseInt(e.target.dataset.typeId));
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
function updateStrategyTable(config, result, sharedData) {
    const tableEl = document.getElementById('mull-strategyTable');
    if (!tableEl) return;

    const threshold = config.confidenceThreshold;
    const useCumulative = document.getElementById('mull-cumulative')?.checked === true;

    // Helper for success styling
    const getSuccessStyle = (prob) => {
        const meets = prob >= threshold;
        return [meets ? '#22c55e' : (prob >= threshold * 0.8 ? '#f59e0b' : '#dc2626'), meets ? '✓' : (prob >= threshold * 0.8 ? '!' : '')];
    };

    // Single Type Case - Simplified Table
    if (config.types.length === 1) {
        const typeName = config.types[0].name;
        // Sort by count descending
        const rows = result.strategy.sort((a, b) => b.counts[0] - a.counts[0]);

        const handLabel = useCumulative ? `≥ ${typeName}` : 'Hand %';

        let tableHTML = `
            <tr>
                <th>${typeName} Count</th>
                <th>Decision</th>
                <th>Success Rate</th>
                <th>${handLabel}</th>
            </tr>
        `;

        rows.forEach(hand => {
            const count = hand.counts[0];
            const decision = hand.keep ? 'Keep' : 'Mulligan';
            const decisionClass = hand.keep ? 'marginal-positive' : 'marginal-negative';
            const rowClass = hand.keep ? '' : 'marginal-negative';

            // Calculate display probability
            let displayProb = hand.handProb;
            if (useCumulative) {
                displayProb = multiTypeProbCumulative(config.deckSize, sharedData.typeCounts, 7, hand.counts);
            }

            // Only show rows where hand probability is relevant (>0.01%) or it's a keep
            if (displayProb < 0.0001 && !hand.keep) return;

            const [successColor, successIcon] = getSuccessStyle(hand.successProb);
            tableHTML += `<tr class="${rowClass}"><td><strong>${count}</strong></td><td class="${decisionClass}" style="font-weight:bold;">${decision}</td><td style="color:${successColor}; font-weight:bold;">${formatPercentage(hand.successProb)} ${successIcon}</td><td style="color:var(--text-dim); font-size:0.9em;">${formatPercentage(displayProb)}</td></tr>`;
        });
        tableEl.innerHTML = tableHTML;
        return;
    }

    // Multi-Type Case: Group hands by decision for cleaner display
    const keepHands = result.strategy.filter(h => h.keep).sort((a, b) => b.successProb - a.successProb);
    const mulliganHands = result.strategy.filter(h => !h.keep).sort((a, b) => b.handProb - a.handProb);

    const handLabel = useCumulative ? 'Hand % (≥)' : 'Hand %';

    const headerRow = `
        <tr>
            ${config.types.map(t => `<th>${t.name}</th>`).join('')}
            <th>${handLabel}</th>
            <th>Success %</th>
            <th>Decision</th>
        </tr>
    `;

    const renderHand = (hand) => {
        const decision = hand.keep ? '✓ Keep' : '✗ Mulligan';
        const rowClass = hand.keep ? '' : 'marginal-negative';
        const decisionClass = hand.keep ? 'marginal-positive' : 'marginal-negative';

        // Calculate display probability
        let displayProb = hand.handProb;
        if (useCumulative) {
            displayProb = multiTypeProbCumulative(config.deckSize, sharedData.typeCounts, 7, hand.counts);
        }

        // Build explanation of what you need to draw
        const needs = config.types.map((type, i) => {
            const have = hand.counts[i];
            const need = type.required;
            if (have >= need) return null;
            return `${need - have} more ${type.name}`;
        }).filter(x => x);

        const needsText = needs.length > 0 ? `Need: ${needs.join(' + ')}` : 'Already have everything!';
        const [successColor] = getSuccessStyle(hand.successProb);

        return `<tr class="${rowClass}" title="${needsText}">${hand.counts.map(c => `<td>${c}</td>`).join('')}<td>${formatPercentage(displayProb)}</td><td title="${needsText}" style="color: ${successColor}; font-weight: bold;">${formatPercentage(hand.successProb)}</td><td class="${decisionClass}">${decision}</td></tr>`;
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
    let takeProbability = mullProb;
    for (let i = 1; i <= 4 && takeProbability > 0.001; i++) {
        const thisKeepProb = takeProbability * keepProb;
        cumulativeKeepProb += thisKeepProb;

        const isFree = i === 1 && freeMulligan;
        const penaltyFactor = freeMulligan ? (i - 1) : i;
        const cards = 7 - (isFree ? 0 : penaltyFactor);
        const label = isFree ? `Mulligan ${i} - Free (see 7, keep 7)` : `Mulligan ${i} (see 7, keep ${cards})`;
        const successRate = openingSuccess * Math.pow(1 - (1/7), isFree ? 0 : penaltyFactor);
        const drawRate = keepProb * Math.pow(1 - (1/7), isFree ? 0 : penaltyFactor);

        breakdown.push({ label, keepProbability: thisKeepProb, drawRate, takeProbability, cumulative: cumulativeKeepProb, successRate });
        takeProbability *= mullProb;
    }

    return breakdown;
}

/**
 * Update summary stats with clearer explanations
 */
function updateSummary(config, result, sharedData) {
    const summaryEl = document.getElementById('mull-summary');
    if (!summaryEl) return;

    // Calculate confidence consistency using shared data
    const confidentKeepRate = result.strategy.reduce((sum, h) =>
        h.keep && h.successProb >= config.confidenceThreshold ? sum + h.handProb : sum, 0);
    const confidenceConsistency = sharedData.totalKeepProb > 0 ? confidentKeepRate / sharedData.totalKeepProb : 0;

    // Marginal benefits helper
    const getImpact = (pct) => pct > 1.5 ? ['🔥 High Impact', '#22c55e'] : pct > 0.5 ? ['✅ Medium Impact', '#4ade80'] : pct < 0 ? ['⚠️ Negative Impact', '#ef4444'] : ['Low Impact', 'var(--text-dim)'];

    const s = { // Common styles
        card: 'text-align:center;padding:16px;border-radius:12px',
        label: 'font-size:0.8em;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px',
        big: 'font-size:2.2em;font-weight:700;line-height:1',
        sub: 'color:var(--text-dim);font-size:0.8em;margin-top:4px'
    };

    const marginalsHTML = result.marginalBenefits.map((b, i) => {
        const [label, color] = getImpact(b.overall * 100);
        return `<li style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.05)"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><span style="color:var(--text-light);font-weight:600">+1 ${config.types[i].name}</span><span style="font-size:0.85em;font-weight:bold;color:${color};background:rgba(255,255,255,0.05);padding:2px 8px;border-radius:4px">${label}</span></div><div style="font-size:0.9em;color:var(--text-secondary)">Increases consistency by <strong style="color:${color}">${formatPercentage(Math.max(0, b.overall), 2)}</strong><span style="font-size:0.9em;color:var(--text-dim)"> (Natural: +${formatPercentage(Math.max(0, b.baseline), 2)})</span></div></li>`;
    }).join('');

    const breakdownHTML = sharedData.breakdown.map(m => `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.9em"><span style="color:var(--text-secondary)">${m.label}</span><span style="color:var(--text-light)">${formatPercentage(m.cumulative)}</span></div>`).join('');

    summaryEl.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px"><div style="${s.card};background:linear-gradient(135deg,rgba(192,132,252,0.1) 0%,rgba(10,10,18,0) 100%);border:1px solid rgba(192,132,252,0.2)"><div style="${s.label}">Expected Success</div><div style="${s.big};color:#c084fc">${formatPercentage(result.expectedSuccess)}</div><div style="${s.sub}">Win rate with optimal play</div></div><div style="${s.card};background:rgba(34,197,94,0.05);border:1px solid rgba(34,197,94,0.2)"><div style="${s.label}">Confidence Check</div><div style="${s.big};color:#4ade80">${formatPercentage(confidenceConsistency)}</div><div style="${s.sub}">of kept hands meet >${formatPercentage(config.confidenceThreshold)} reqs</div></div></div><div style="background:var(--panel-bg-alt);border-radius:8px;padding:16px;margin-bottom:20px"><div style="margin-bottom:12px;color:var(--text-secondary);font-size:0.95em">This strategy suggests mulliganing <strong>${formatNumber(result.avgMulligans, 2)}</strong> times on average.</div><details><summary style="cursor:pointer;color:var(--text-dim);font-size:0.85em">View Strategy Details</summary><div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-color)">${breakdownHTML}</div></details></div><div style="background:rgba(255,255,255,0.02);border:1px solid var(--border-color);border-radius:8px;padding:16px"><h3 style="margin:0 0 16px 0;font-size:0.95em;color:var(--text-light);text-transform:uppercase;letter-spacing:0.5px">💡 Marginal Value Analysis</h3><ul style="margin:0;padding:0;list-style:none">${marginalsHTML}</ul></div>`;
}

/**
 * Common chart options generator
 */
function getChartOptions(xLabel, yLabel = 'Probability', title = null) {
    return {
        plugins: {
            ...(title && { title: { display: true, text: title, color: '#a09090', font: { size: 14, weight: 'normal' }, padding: { bottom: 15 } } }),
            legend: { display: true, position: 'top', labels: { color: '#a09090', font: { size: 11 }, padding: 12, usePointStyle: true } },
            tooltip: { mode: 'index', intersect: false, callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%` } }
        },
        scales: {
            x: { grid: { color: 'rgba(192, 132, 252, 0.1)', drawBorder: false }, ticks: { color: '#a09090' }, title: { display: true, text: xLabel, color: '#a09090' } },
            y: { beginAtZero: true, max: 100, grid: { color: 'rgba(192, 132, 252, 0.15)', drawBorder: false }, ticks: { color: '#c084fc', callback: v => v + '%' }, title: { display: true, text: yLabel, color: '#c084fc' } }
        }
    };
}

/**
 * Calculate turn-by-turn probabilities
 */
function calculateTurnProbabilities(config) {
    const maxTurn = Math.max(...config.types.map(t => t.byTurn)) + 3;
    const turnData = [];

    for (let turn = 0; turn <= maxTurn; turn++) {
        const cardsSeen = turn === 0 ? 7 : 7 + (config.onThePlay ? Math.max(0, turn - 1) : turn);

        // Individual type probabilities
        const typeProbabilities = config.types.map(type => {
            let prob = 0;
            for (let drawn = type.required; drawn <= Math.min(type.count, cardsSeen); drawn++) {
                prob += multiTypeProb(config.deckSize, [type.count], cardsSeen, [drawn]);
            }
            return prob;
        });

        // Combined probability using cumulative function
        const combinedProb = multiTypeProbCumulative(
            config.deckSize,
            config.types.map(t => t.count),
            cardsSeen,
            config.types.map(t => t.required)
        );

        turnData.push({ turn, typeProbabilities, combinedProb });
    }

    return turnData;
}

/**
 * Update visualization charts
 */
function updateChart(config, sharedData) {
    // Mulligan Success Chart
    if (document.getElementById('mull-chart')) {
        const labels = sharedData.breakdown.map(m => m.label.includes('Opening') ? 'Opening' : `Mull ${m.label.match(/\d+/)?.[0] || ''}`);

        chart = createOrUpdateChart(chart, 'mull-chart', {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Single attempt', data: sharedData.breakdown.map(m => m.keepProbability * 100), backgroundColor: 'rgba(220, 38, 38, 0.8)', borderColor: '#dc2626', borderWidth: 1, order: 2 },
                    { label: 'Cumulative', data: sharedData.breakdown.map(m => m.cumulative * 100), type: 'line', borderColor: '#c084fc', backgroundColor: 'rgba(192, 132, 252, 0.15)', fill: true, tension: 0.4, pointRadius: 5, pointBackgroundColor: '#c084fc', pointBorderColor: '#fff', pointBorderWidth: 2, order: 1 }
                ]
            },
            options: getChartOptions('Mulligan')
        });
    }

    // Turn-by-Turn Chart (compute once if not cached in sharedData)
    if (document.getElementById('mull-turn-chart')) {
        if (!sharedData.turnData) {
            sharedData.turnData = calculateTurnProbabilities(config);
        }
        const colors = ['#a855f7', '#6b7280', '#c084fc'];

        const datasets = [
            ...config.types.map((type, i) => ({
                label: type.name,
                data: sharedData.turnData.map(d => d.typeProbabilities[i] * 100),
                borderColor: colors[i % colors.length],
                backgroundColor: colors[i % colors.length] + '30',
                borderWidth: 2,
                fill: false,
                tension: 0.3,
                pointRadius: 3,
                pointBackgroundColor: colors[i % colors.length],
                borderDash: [5, 5]
            })),
            { label: 'Confidence Threshold', data: sharedData.turnData.map(() => config.confidenceThreshold * 100), borderColor: '#22c55e', borderWidth: 2, borderDash: [2, 2], pointRadius: 0, fill: false, order: 0 },
            { label: 'Combined (ALL)', data: sharedData.turnData.map(d => d.combinedProb * 100), borderColor: '#c084fc', backgroundColor: 'rgba(192, 132, 252, 0.15)', borderWidth: 3, fill: true, tension: 0.3, pointRadius: 5, pointBackgroundColor: '#c084fc', pointBorderColor: '#fff', pointBorderWidth: 2 }
        ];

        turnChart = createOrUpdateChart(turnChart, 'mull-turn-chart', {
            type: 'line',
            data: { labels: sharedData.turnData.map(d => d.turn), datasets },
            options: getChartOptions('Turn', 'Probability', 'Natural Draw Probability (No Mulligan)')
        });
    }
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

    // Pre-compute shared data once
    const sharedData = {
        breakdown: calculateMulliganBreakdown(result.strategy, config.freeMulligan, result.bestKeepProb),
        totalKeepProb: result.strategy.filter(h => h.keep).reduce((s, h) => s + h.handProb, 0),
        typeCounts: config.types.map(t => t.count),
        turnData: null  // Lazy computed on first use
    };

    updateChart(config, sharedData);
    updateStrategyTable(config, result, sharedData);
    updateSummary(config, result, sharedData);
}

/**
 * Handle Preset Change
 */
function applyPreset(preset) {
    const presets = {
        casual: [0.4, 80, "High penalty. You prefer to keep 7 cards even if they are suboptimal."],
        balanced: [0.2, 85, "Standard. A balanced approach to risk."],
        competitive: [0.05, 90, "Low penalty. You are willing to mulligan aggressively to find key pieces."]
    };

    const [penalty, threshold, desc] = presets[preset] || presets.balanced;
    const els = {
        penalty: document.getElementById('mull-penalty'),
        penaltyDisplay: document.getElementById('mull-penalty-display'),
        penaltyDesc: document.getElementById('mull-penalty-desc'),
        threshold: document.getElementById('mull-threshold'),
        thresholdDisplay: document.getElementById('mull-threshold-display')
    };

    if (!els.penalty || !els.threshold) return;

    els.penalty.value = penalty;
    els.penaltyDisplay.textContent = (penalty * 100).toFixed(0) + '%';
    els.penaltyDesc.textContent = desc;
    els.threshold.value = threshold;
    els.thresholdDisplay.textContent = threshold + '%';
    updateUI();
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

    // Preset Selector
    const presetSelect = document.getElementById('mull-preset');
    if (presetSelect) {
        presetSelect.addEventListener('change', (e) => {
            applyPreset(e.target.value);
        });
    }

    // Sliders with unified handler
    const setupSlider = (id, displayId, formatter) => {
        const slider = document.getElementById(id);
        const display = document.getElementById(displayId);
        if (slider && display) {
            slider.addEventListener('input', () => {
                display.textContent = formatter(slider.value);
                updateUI();
            });
        }
    };

    setupSlider('mull-penalty', 'mull-penalty-display', v => (parseFloat(v) * 100).toFixed(0) + '%');
    setupSlider('mull-threshold', 'mull-threshold-display', v => v + '%');

    // Checkboxes with unified handler
    ['mull-free', 'mull-on-play', 'mull-cumulative'].forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) checkbox.addEventListener('change', () => updateUI());
    });

    // Listen for deck configuration changes
    DeckConfig.onDeckUpdate(() => {
        updateUI();
    });

    updateUI();
}