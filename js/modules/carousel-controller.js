/* ============================================================================
   VivoTV - Carousel Controller Module
   High-performance momentum scrolling, inertia drag & arrow management
   ============================================================================ */

/**
 * Updates left/right arrow opacity based on horizontal scroll position
 * @param {HTMLElement} carousel 
 */
export function updateCarouselArrows(carousel) {
    if (!carousel) return;
    const wrapper = carousel.closest('.carousel-wrapper');
    if (!wrapper) return;
    const leftBtn = wrapper.querySelector('.carousel-arrow-left');
    const rightBtn = wrapper.querySelector('.carousel-arrow-right');
    
    if (leftBtn) {
        leftBtn.style.opacity = carousel.scrollLeft <= 10 ? '0' : '1';
        leftBtn.style.pointerEvents = carousel.scrollLeft <= 10 ? 'none' : 'auto';
    }
    if (rightBtn) {
        const isAtEnd = (carousel.scrollLeft + carousel.clientWidth) >= (carousel.scrollWidth - 10);
        rightBtn.style.opacity = isAtEnd ? '0' : '1';
        rightBtn.style.pointerEvents = isAtEnd ? 'none' : 'auto';
    }
}

/**
 * Initializes click delegation for carousel left/right arrow buttons
 */
export function initCarouselArrows() {
    if (window._carouselArrowsInitialized) return;
    window._carouselArrowsInitialized = true;

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.carousel-arrow');
        if (!btn) return;
        const wrapper = btn.closest('.carousel-wrapper');
        const carousel = wrapper ? wrapper.querySelector('.carousel') : null;
        if (!carousel) return;
        
        const direction = btn.classList.contains('carousel-arrow-left') ? -1 : 1;
        const scrollAmount = carousel.clientWidth * 0.8;
        carousel.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' });
        
        setTimeout(() => updateCarouselArrows(carousel), 500);
    });

    // Update arrows on natural scroll (wheel/touch)
    document.addEventListener('scroll', (e) => {
        if (e.target.classList?.contains('carousel')) {
            updateCarouselArrows(e.target);
        }
    }, true);
}

/**
 * Premium inertia & momentum drag scrolling for all movie carousels
 */
export function initCarouselInertia() {
    if (window._carouselInertiaInitialized) return;
    window._carouselInertiaInitialized = true;

    initCarouselArrows();

    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    let activeCarousel = null;
    let hasMoved = false;
    let velocity = 0;
    let lastX = 0;
    let lastTime = 0;
    let momentumId = null;

    document.addEventListener('mousedown', (e) => {
        const carousel = e.target.closest('.carousel');
        if (!carousel) return;
        if (e.target.closest('button, a, input, select, textarea, .movie-card-badges')) return;

        isDown = true;
        activeCarousel = carousel;
        startX = e.pageX - carousel.offsetLeft;
        scrollLeft = carousel.scrollLeft;
        hasMoved = false;
        velocity = 0;
        lastX = e.pageX;
        lastTime = performance.now();
        if (momentumId) cancelAnimationFrame(momentumId);
        carousel.style.scrollBehavior = 'auto';
        carousel.style.scrollSnapType = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDown || !activeCarousel) return;
        const x = e.pageX - activeCarousel.offsetLeft;
        const walk = x - startX;

        if (Math.abs(walk) > 6) {
            hasMoved = true;
            activeCarousel.classList.add('is-dragging');
        }

        if (hasMoved) {
            e.preventDefault();
            activeCarousel.scrollLeft = scrollLeft - walk;

            const now = performance.now();
            const dt = now - lastTime;
            if (dt > 0) {
                velocity = (e.pageX - lastX) / dt;
            }
            lastX = e.pageX;
            lastTime = now;
        }
    });

    const endDrag = () => {
        if (!isDown || !activeCarousel) return;
        isDown = false;
        const carousel = activeCarousel;
        activeCarousel = null;

        if (hasMoved) {
            let currentVelocity = velocity * 18;
            const applyMomentum = () => {
                if (Math.abs(currentVelocity) > 0.5) {
                    carousel.scrollLeft -= currentVelocity;
                    currentVelocity *= 0.92;
                    momentumId = requestAnimationFrame(applyMomentum);
                } else {
                    carousel.style.scrollBehavior = 'smooth';
                    carousel.style.scrollSnapType = 'x mandatory';
                    carousel.classList.remove('is-dragging');
                    updateCarouselArrows(carousel);
                }
            };
            momentumId = requestAnimationFrame(applyMomentum);

            setTimeout(() => {
                carousel.classList.remove('is-dragging');
            }, 80);
        } else {
            carousel.style.scrollBehavior = 'smooth';
            carousel.style.scrollSnapType = 'x mandatory';
        }
    };

    document.addEventListener('mouseup', endDrag);
    document.addEventListener('mouseleave', endDrag);

    // Suppress card click if dragging
    document.addEventListener('click', (e) => {
        const card = e.target.closest('.movie-card');
        if (card) {
            const carousel = card.closest('.carousel');
            if (carousel && carousel.classList.contains('is-dragging')) {
                e.stopPropagation();
                e.preventDefault();
            }
        }
    }, true);
}
