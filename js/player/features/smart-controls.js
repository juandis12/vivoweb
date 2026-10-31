/* ============================================================================
   VivoTV Player - Smart Controls Builder Module
   Injects Prime X-Ray, Apple Audio Boost, Disney IMAX switcher, Netflix Skip Intro
   ============================================================================ */
import { showToast } from '../../utils.js';

export function createSmartControls(context) {
    const container = document.getElementById('playerContainer');
    if (!container) return;

    // 1. PRIME VIDEO: X-Ray Trigger
    if (!document.getElementById('btnXRay')) {
        const xrayBtn = document.createElement('button');
        xrayBtn.id = 'btnXRay';
        xrayBtn.className = 'xray-trigger-btn';
        xrayBtn.setAttribute('title', 'Ver elenco y ficha en tiempo real (X-Ray)');
        xrayBtn.innerHTML = `<span>⚡ X-RAY</span>`;
        xrayBtn.onclick = () => context.toggleXRay();
        container.appendChild(xrayBtn);
    }

    // 2. DISNEY+: IMAX Enhanced aspect ratio switcher
    if (!document.getElementById('btnAspect')) {
        const aspectBtn = document.createElement('button');
        aspectBtn.id = 'btnAspect';
        aspectBtn.className = 'aspect-ratio-btn';
        aspectBtn.setAttribute('title', 'Alternar relación de aspecto (IMAX Enhanced 16:9 / Cinemascope 2.39:1)');
        aspectBtn.innerHTML = `<span>📺 IMAX</span>`;
        aspectBtn.onclick = () => context.toggleAspectRatio();
        container.appendChild(aspectBtn);
    }

    // 3. APPLE TV+: Dialogue Boost
    if (!document.getElementById('btnAudioBoost')) {
        const audioBtn = document.createElement('button');
        audioBtn.id = 'btnAudioBoost';
        audioBtn.className = 'audio-boost-btn';
        audioBtn.setAttribute('title', 'Mejora la claridad de las voces atenuando ruidos fuertes');
        audioBtn.innerHTML = `<span class="audio-boost-indicator"></span> <span>🎙️ Diálogo Nítido</span>`;
        audioBtn.onclick = () => context.toggleAudioBoost();
        container.appendChild(audioBtn);
    }

    // 4. NETFLIX: Skip Intro with Countdown
    if (!document.getElementById('btnSkipIntro')) {
        const skipBtn = document.createElement('button');
        skipBtn.id = 'btnSkipIntro';
        skipBtn.className = 'skip-intro-btn';
        skipBtn.innerHTML = `<span>Saltar Intro</span> <span id="skipCountdown" class="skip-countdown-pill">5s</span> <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>`;
        skipBtn.onclick = () => {
            context._cancelAutoSkipCountdown();
            const video = document.getElementById('videoPlayer');
            if (video) video.currentTime += 85;
            skipBtn.classList.remove('active');
            showToast("Intro saltada ⏩", "info");
        };
        container.appendChild(skipBtn);
    }

    // 5. Picture-in-Picture Button
    if (!document.getElementById('btnPiP')) {
        const pipBtn = document.createElement('div');
        pipBtn.id = 'btnPiP';
        pipBtn.className = 'pip-btn';
        pipBtn.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" fill="#fff" title="Ventana flotante (PiP)"><path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/></svg>`;
        pipBtn.onclick = () => context.togglePiP();
        container.appendChild(pipBtn);
    }
}
