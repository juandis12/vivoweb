/* ============================================================================
   VivoTV - Disney+ Brand Hubs Module
   Interactive brand navigation, smooth scroll, and haptic feedback
   ============================================================================ */
import { showToast } from '../utils.js';

/**
 * Initializes brand hub cards (Disney, Marvel, Pixar, Star Wars, NatGeo)
 */
export function initBrandHubs() {
    const cards = document.querySelectorAll('.brand-hub-card');
    cards.forEach(card => {
        card.onclick = () => {
            const targetId = card.dataset.target;
            const title = card.dataset.title;
            const targetSection = document.getElementById(targetId);
            
            if (targetSection) {
                targetSection.classList.remove('hidden');
                targetSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                targetSection.classList.add('hub-pulse-highlight');
                setTimeout(() => targetSection.classList.remove('hub-pulse-highlight'), 1400);
            }
            
            showToast(`Explorando ${title} ✨`, 'info');
            
            if ('vibrate' in navigator) {
                try { navigator.vibrate(15); } catch {}
            }
        };
    });
}
