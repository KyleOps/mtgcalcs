/**
 * Deck Presets
 * Common deck configurations for quick start
 */

export const PORTENT_PRESETS = [
    {
        name: 'Balanced',
        icon: '⚖️',
        desc: 'Even type distribution',
        config: {
            creature: 25,
            instant: 8,
            sorcery: 6,
            artifact: 4,
            enchantment: 3,
            planeswalker: 2,
            land: 32,
            battle: 0
        }
    },
    {
        name: 'Creature Heavy',
        icon: '🦖',
        desc: 'More creatures',
        config: {
            creature: 35,
            instant: 5,
            sorcery: 4,
            artifact: 3,
            enchantment: 2,
            planeswalker: 1,
            land: 30,
            battle: 0
        }
    },
    {
        name: 'Spell Slinger',
        icon: '⚡',
        desc: 'More instants/sorceries',
        config: {
            creature: 20,
            instant: 12,
            sorcery: 10,
            artifact: 3,
            enchantment: 2,
            planeswalker: 3,
            land: 30,
            battle: 0
        }
    },
    {
        name: 'Artifacts',
        icon: '⚙️',
        desc: 'Artifact-focused',
        config: {
            creature: 15,
            instant: 6,
            sorcery: 5,
            artifact: 15,
            enchantment: 4,
            planeswalker: 2,
            land: 33,
            battle: 0
        }
    }
];

export const SURGE_PRESETS = [
    {
        name: 'All Permanents',
        icon: '✨',
        desc: 'No instants/sorceries',
        config: {
            creature: 45,
            instant: 0,
            sorcery: 0,
            artifact: 8,
            enchantment: 6,
            planeswalker: 2,
            land: 38,
            battle: 0
        }
    },
    {
        name: 'One Spell',
        icon: '🎯',
        desc: 'Just Primal Surge',
        config: {
            creature: 40,
            instant: 0,
            sorcery: 1,
            artifact: 8,
            enchantment: 6,
            planeswalker: 2,
            land: 32,
            battle: 0
        }
    },
    {
        name: 'Some Interaction',
        icon: '🛡️',
        desc: 'A few instant spells',
        config: {
            creature: 38,
            instant: 3,
            sorcery: 1,
            artifact: 8,
            enchantment: 6,
            planeswalker: 2,
            land: 32,
            battle: 0
        }
    }
];

export const WAVE_PRESETS = [
    {
        name: 'Low Curve',
        icon: '🏃',
        desc: 'Lots of cheap spells',
        config: {
            cmc0: 20,
            cmc2: 15,
            cmc3: 10,
            cmc4: 8,
            cmc5: 5,
            cmc6: 3,
            lands: 35,
            nonperm: 3
        }
    },
    {
        name: 'Mid-Range',
        icon: '📊',
        desc: 'Balanced CMC',
        config: {
            cmc0: 15,
            cmc2: 12,
            cmc3: 10,
            cmc4: 8,
            cmc5: 6,
            cmc6: 4,
            lands: 32,
            nonperm: 12
        }
    },
    {
        name: 'High Impact',
        icon: '💥',
        desc: 'Expensive permanents',
        config: {
            cmc0: 10,
            cmc2: 8,
            cmc3: 8,
            cmc4: 10,
            cmc5: 10,
            cmc6: 12,
            lands: 35,
            nonperm: 6
        }
    }
];

/**
 * Apply preset to calculator
 * @param {string} mode - Calculator mode (portent, surge, wave)
 * @param {Object} preset - Preset configuration
 */
export function applyPreset(mode, preset) {
    if (mode === 'wave') {
        // Wave has CMC-based inputs
        Object.keys(preset.config).forEach(key => {
            const input = document.getElementById(`wave-${key}`);
            if (input) {
                input.value = preset.config[key];
                // Trigger input event for recalculation
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
    } else {
        // Portent and Surge have type-based inputs
        const typeMap = {
            creature: 'creatures',
            instant: 'instants',
            sorcery: 'sorceries',
            artifact: 'artifacts',
            enchantment: 'enchantments',
            planeswalker: 'planeswalkers',
            land: 'lands',
            battle: 'battles'
        };

        Object.keys(preset.config).forEach(key => {
            const inputId = `${mode}-${typeMap[key]}`;
            const input = document.getElementById(inputId);
            if (input) {
                input.value = preset.config[key];
                // Trigger input event for recalculation
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
    }
}
