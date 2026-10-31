/* ============================================================================
   VivoTV - Navigation & Core UI Interactions Module
   Handles glassmorphism navbar scroll, mobile pill indicator, exit modal, and loaders
   ============================================================================ */

/**
 * Initializes navbar background transition on scroll
 */
export function initNavbarScroll() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;
    
    const onScroll = () => {
        const scrolled = window.scrollY > 15;
        navbar.classList.toggle('scrolled', scrolled);
        navbar.style.background = '';
    };

    window.removeEventListener('scroll', onScroll);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // Run immediately in case already scrolled
}

/**
 * Magnetic pill indicator for mobile navigation bar
 */
export function initMobileNavIndicator() {
    const nav = document.querySelector('.mobile-nav');
    const indicator = document.getElementById('navIndicator');
    const activeItem = document.querySelector('.mobile-nav-item.active');

    if (!nav || !indicator || !activeItem) return;

    setTimeout(() => {
        const navRect = nav.getBoundingClientRect();
        const activeRect = activeItem.getBoundingClientRect();

        const offsetLeft = activeRect.left - navRect.left;
        const itemWidth = activeRect.width;
        const indicatorWidth = 64;

        indicator.style.left = `${offsetLeft + (itemWidth - indicatorWidth) / 2}px`;
        indicator.style.opacity = "1";
    }, 100);
}

/**
 * Smooth touch slide interaction for mobile navigation
 */
export function initMagicSlide() {
    const nav = document.querySelector('.mobile-nav');
    const indicator = document.getElementById('navIndicator');
    if (!nav || !indicator) return;

    let isDragging = false;
    let targetLink = null;
    let preloadedUrls = new Set();
    const navRect = nav.getBoundingClientRect();
    const items = Array.from(nav.querySelectorAll('.mobile-nav-item'));

    items.forEach(item => {
        item.addEventListener('click', (e) => {
            if (isDragging) e.preventDefault();
        });
    });

    const handleTouchMove = (e) => {
        if (!isDragging) return;
        const touch = e.touches[0];
        let x = touch.clientX - navRect.left;
        x = Math.max(0, Math.min(x, navRect.width));

        const colWidth = navRect.width / items.length;
        const index = Math.floor(x / colWidth);
        const closestItem = items[Math.min(index, items.length - 1)];

        if (closestItem) {
            targetLink = closestItem;
            const activeRect = closestItem.getBoundingClientRect();
            const offsetLeft = activeRect.left - navRect.left;
            const indicatorWidth = 64; 
            
            indicator.style.left = `${offsetLeft + (activeRect.width - indicatorWidth) / 2}px`;

            const url = closestItem.href;
            if (url && !preloadedUrls.has(url) && !closestItem.classList.contains('active')) {
                preloadedUrls.add(url);
                const link = document.createElement('link');
                link.rel = 'prefetch';
                link.href = url;
                document.head.appendChild(link);
            }
        }
    };

    nav.addEventListener('touchstart', (e) => {
        isDragging = true;
        indicator.classList.add('dragging');
        handleTouchMove(e);
    }, { passive: true });

    nav.addEventListener('touchmove', handleTouchMove, { passive: true });

    nav.addEventListener('touchend', () => {
        isDragging = false;
        indicator.classList.remove('dragging');
        
        if (targetLink && !targetLink.classList.contains('active')) {
            targetLink.classList.add('active'); 
            if (window.LAYOUT && typeof window.LAYOUT.navigateTo === 'function') {
                window.LAYOUT.navigateTo(targetLink.href);
            } else {
                window.location.href = targetLink.href;
            }
        } else {
            initMobileNavIndicator();
        }
    });
}

/**
 * GPU accelerated magnetic hover placeholder
 */
export function initMagneticHover() {
    // Hardware accelerated via CSS transform scale
}

/**
 * Fade out and remove the initial boot splash screen
 */
export function hideSplashScreen() {
    const splash = document.getElementById('splashScreen');
    if (splash) {
        splash.style.transition = 'opacity 0.8s ease, visibility 0.8s';
        splash.style.opacity = '0';
        splash.style.visibility = 'hidden';
        splash.style.pointerEvents = 'none';
        setTimeout(() => splash.style.display = 'none', 1000);
    }
}

/**
 * Sets button loading state
 */
export function setLoading(loading, btnSubmit, btnText, btnLoader) {
    if (!btnSubmit) return;
    btnSubmit.disabled = loading;
    if (btnLoader) btnLoader.classList.toggle('hidden', !loading);
    if (btnText) btnText.style.opacity = loading ? '0' : '1';
}

/**
 * Sets logout loading state in exit modal
 */
export function setLoadingLogout(loading) {
    const btnLogoutConfirm = document.getElementById('btnLogoutConfirm');
    if (!btnLogoutConfirm) return;
    btnLogoutConfirm.disabled = loading;
    const txt = btnLogoutConfirm.querySelector('.btn-text');
    const ldr = btnLogoutConfirm.querySelector('.btn-loader');
    if (txt) txt.style.opacity = loading ? '0' : '1';
    if (ldr) ldr.classList.toggle('hidden', !loading);
}

/**
 * Configures the Exit / Switch Profile modal listeners
 */
export function setupExitModalListeners(supabase) {
    const exitModal = document.getElementById('exitModal');
    const btnLogout = document.getElementById('btnLogout');
    const btnSwitchProfile = document.getElementById('btnSwitchProfile');
    const btnLogoutConfirm = document.getElementById('btnLogoutConfirm');
    const btnCancelExit = document.getElementById('btnCancelExit');
    const btnOpenAchievements = document.getElementById('btnOpenAchievements');
    const btnOpenVibeDiscovery = document.getElementById('btnOpenVibeDiscovery');

    if (!exitModal) return;

    if (btnOpenAchievements) {
        btnOpenAchievements.onclick = () => {
            exitModal.classList.add('hidden');
            if (window.ACHIEVEMENTS && typeof window.ACHIEVEMENTS._togglePanel === 'function') {
                window.ACHIEVEMENTS._togglePanel();
            } else {
                const achPanel = document.getElementById('achPanel');
                if (achPanel) achPanel.classList.toggle('open');
            }
        };
    }

    if (btnOpenVibeDiscovery) {
        btnOpenVibeDiscovery.onclick = () => {
            exitModal.classList.add('hidden');
            const vibeContainer = document.getElementById('vibeEngineContainer');
            if (vibeContainer) {
                vibeContainer.classList.add('open');
            } else if (window.vibeEngine && typeof window.vibeEngine._toggle === 'function') {
                window.vibeEngine._toggle();
            }
        };
    }

    if (btnLogout) {
        btnLogout.onclick = () => {
            exitModal.classList.remove('hidden');
        };
    }

    if (btnCancelExit) {
        btnCancelExit.onclick = () => {
            exitModal.classList.add('hidden');
        };
    }

    if (btnSwitchProfile) {
        btnSwitchProfile.onclick = () => {
            exitModal.classList.add('hidden');
            window.location.href = 'profiles.html';
        };
    }

    if (btnLogoutConfirm) {
        btnLogoutConfirm.onclick = async () => {
            setLoadingLogout(true);
            try {
                if (supabase) {
                    await supabase.auth.signOut();
                }
                localStorage.removeItem('vivotv_current_profile');
                sessionStorage.removeItem('vivotv_profile_chosen');
                window.location.href = 'index.html';
            } catch (err) {
                console.error('Error cerrando sesión:', err);
                setLoadingLogout(false);
            }
        };
    }

    // Close when clicking outside modal box
    exitModal.onclick = (e) => {
        if (e.target === exitModal) {
            exitModal.classList.add('hidden');
        }
    };
}
