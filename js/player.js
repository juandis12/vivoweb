/* ============================================================================
   VivoTV - Player Façade & Entry Point
   Modularized into js/player/core.js, tracking.js, controls.js, state.js
   ============================================================================ */
import { defaultPlayerState, setSupabaseClient, getSupabase } from './player/state.js';
import { coreMethods } from './player/core.js';
import { trackingMethods } from './player/tracking.js';
import { controlMethods } from './player/controls.js';

export function setSupabase(client) { 
    setSupabaseClient(client);
    import('./binge-engine.js').then(m => {
        m.BingeEngine.init(PLAYER_LOGIC, client);
    }).catch(err => {
        console.warn('[Player] BingeEngine init deferred:', err);
    });
}

export const PLAYER_LOGIC = {
    ...defaultPlayerState,
    ...coreMethods,
    ...trackingMethods,
    ...controlMethods
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') PLAYER_LOGIC.closeModal();
});

window.PLAYER_LOGIC = PLAYER_LOGIC;
