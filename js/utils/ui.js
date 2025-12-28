/**
 * UI Utilities
 * Handles collapsible sections, animations, and UX improvements
 */

/**
 * Initialize collapsible sections
 */
export function initCollapsibleSections() {
    const sections = document.querySelectorAll('.collapsible-header');

    sections.forEach(header => {
        header.addEventListener('click', () => {
            const parent = header.closest('.collapsible-section');
            const content = parent.querySelector('.collapsible-content');
            const isExpanded = parent.classList.contains('expanded');

            // Toggle expanded state
            parent.classList.toggle('expanded');
            header.setAttribute('aria-expanded', !isExpanded);

            // Smooth animation
            if (!isExpanded) {
                content.style.maxHeight = content.scrollHeight + 'px';
            } else {
                content.style.maxHeight = '0';
            }

            // Store preference
            const sectionId = parent.id;
            if (sectionId) {
                localStorage.setItem(`section-${sectionId}`, !isExpanded);
            }
        });
    });

    // Restore saved states
    document.querySelectorAll('.collapsible-section').forEach(section => {
        const sectionId = section.id;
        if (sectionId) {
            const savedState = localStorage.getItem(`section-${sectionId}`);
            if (savedState === 'true') {
                const header = section.querySelector('.collapsible-header');
                header.click();
            }
        }
    });
}

/**
 * Show/hide floating action button based on scroll
 */
export function initFloatingActionButton() {
    const fab = document.querySelector('.fab');
    if (!fab) return;

    let lastScroll = 0;

    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;

        if (currentScroll > 100) {
            fab.classList.add('visible');
        } else {
            fab.classList.remove('visible');
        }

        lastScroll = currentScroll;
    }, { passive: true });
}

/**
 * Initialize quick import overlay
 */
export function initQuickImport() {
    const quickImportBtns = document.querySelectorAll('.quick-import-btn');
    const overlay = document.getElementById('import-overlay');
    const closeBtn = overlay?.querySelector('.close-overlay');

    if (!overlay) return;

    quickImportBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            overlay.classList.add('active');
            document.body.style.overflow = 'hidden';

            // Focus input
            const input = overlay.querySelector('input[type="text"]');
            if (input) {
                setTimeout(() => input.focus(), 300);
            }
        });
    });

    closeBtn?.addEventListener('click', () => {
        closeOverlay();
    });

    overlay?.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeOverlay();
        }
    });

    // ESC key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('active')) {
            closeOverlay();
        }
    });

    function closeOverlay() {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
}

/**
 * Initialize sticky results on mobile
 */
export function initStickyResults() {
    if (window.innerWidth > 900) return; // Desktop only

    const resultsSection = document.querySelectorAll('.results-section');

    resultsSection.forEach(section => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                section.classList.toggle('stuck', !entry.isIntersecting);
            },
            {
                threshold: [0],
                rootMargin: '-60px 0px 0px 0px'
            }
        );

        observer.observe(section);
    });
}

/**
 * Auto-expand results when calculated
 */
export function autoExpandResults() {
    // On mobile, auto-collapse config and expand results after calculation
    if (window.innerWidth <= 900) {
        const configSection = document.querySelector('.collapsible-section.deck-config.expanded');
        const resultsSection = document.querySelector('.collapsible-section.results:not(.expanded)');

        if (configSection && resultsSection) {
            // Collapse config
            const configHeader = configSection.querySelector('.collapsible-header');
            configHeader?.click();

            // Expand results
            setTimeout(() => {
                const resultsHeader = resultsSection.querySelector('.collapsible-header');
                resultsHeader?.click();

                // Scroll to results
                resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 300);
        }
    }
}

/**
 * Show toast notification
 * @param {string} message - Toast message
 * @param {string} type - Type (success, error, info)
 */
export function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    document.body.appendChild(toast);

    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Initialize smooth scroll for anchor links
 */
export function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

/**
 * Add ripple effect to buttons
 */
export function initRippleEffect() {
    const buttons = document.querySelectorAll('.tab-button, .import-btn, .preset-btn');

    buttons.forEach(button => {
        button.addEventListener('click', function(e) {
            const ripple = document.createElement('span');
            ripple.classList.add('ripple');

            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;

            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';

            this.appendChild(ripple);

            setTimeout(() => ripple.remove(), 600);
        });
    });
}

/**
 * Detect mobile device
 */
export function isMobile() {
    return window.innerWidth <= 900;
}

/**
 * Haptic feedback (if supported)
 */
export function hapticFeedback(type = 'light') {
    if ('vibrate' in navigator) {
        const patterns = {
            light: 10,
            medium: 20,
            heavy: 50
        };
        navigator.vibrate(patterns[type] || 10);
    }
}
