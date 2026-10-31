/**
 * update-notifier.js — Sistema Inteligente de Detección y Notificación de Actualizaciones
 * Garantiza que usuarios y navegadores móviles/escritorio reciban siempre la última versión.
 */

export const UPDATE_NOTIFIER = {
    swRegistration: null,
    isPromptShown: false,
    checkInterval: null,
    currentVersion: null,

    init() {
        if (typeof window === 'undefined') return;

        this.injectStyles();
        this.initServiceWorker();
        this.initVersionPolling();
        this.setupVisibilityListener();
        
        // Exponer método para debug manual en consola
        window.VIVOTV_CHECK_UPDATES = () => this.forceCheck();
    },

    /**
     * Registra y supervisa el ciclo de vida del Service Worker
     */
    async initServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            console.log('[UpdateNotifier] Service Worker no soportado en este entorno.');
            return;
        }

        try {
            const reg = await navigator.serviceWorker.register('./sw.js');
            this.swRegistration = reg;
            console.log('[UpdateNotifier] SW activo en scope:', reg.scope);

            // 1. Si ya hay un worker esperando en background al cargar la página
            if (reg.waiting) {
                this.showUpdateBanner(reg.waiting);
                return;
            }

            // 2. Si hay un worker instalándose actualmente
            if (reg.installing) {
                this.trackInstallingWorker(reg.installing);
            }

            // 3. Escuchar nuevas actualizaciones que lleguen durante la sesión
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                if (newWorker) {
                    this.trackInstallingWorker(newWorker);
                }
            });

            // 4. Cuando el nuevo Service Worker toma el control (controllerchange)
            let refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (refreshing) return;
                refreshing = true;
                console.log('[UpdateNotifier] Nuevo controlador activado. Recargando con versión limpia...');
                window.location.reload();
            });

        } catch (err) {
            console.warn('[UpdateNotifier] Falló el registro del Service Worker:', err);
        }
    },

    /**
     * Rastrea el cambio de estado del nuevo Service Worker
     */
    trackInstallingWorker(worker) {
        worker.addEventListener('statechange', () => {
            if (worker.state === 'installed') {
                // Solo mostrar si ya había un SW anterior controlando la página
                if (navigator.serviceWorker.controller) {
                    console.log('[UpdateNotifier] ✨ Nueva actualización detectada y lista para activarse.');
                    this.showUpdateBanner(worker);
                }
            }
        });
    },

    /**
     * Muestra el banner flotante con estilo Liquid Morph
     */
    showUpdateBanner(waitingWorker = null) {
        if (this.isPromptShown) return;
        if (document.getElementById('vivotvUpdateBanner')) return;

        this.isPromptShown = true;

        const banner = document.createElement('aside');
        banner.id = 'vivotvUpdateBanner';
        banner.className = 'vivotv-update-banner liquid-glass-update';
        banner.setAttribute('role', 'alert');
        banner.setAttribute('aria-live', 'polite');

        banner.innerHTML = `
            <div class="vivotv-update-content">
                <div class="vivotv-update-icon-wrapper">
                    <span class="vivotv-update-icon">🚀</span>
                    <span class="vivotv-update-pulse"></span>
                </div>
                <div class="vivotv-update-text">
                    <div class="vivotv-update-title">¡Nueva versión disponible!</div>
                    <div class="vivotv-update-desc">Hemos añadido mejoras en canales, rendimiento y estabilidad.</div>
                </div>
            </div>
            <div class="vivotv-update-actions">
                <button id="btnDismissUpdate" class="vivotv-update-btn-dismiss" type="button">Más tarde</button>
                <button id="btnApplyUpdate" class="vivotv-update-btn-apply" type="button">
                    <span>Actualizar ahora</span>
                </button>
            </div>
        `;

        document.body.appendChild(banner);

        // Feedback háptico suave si el dispositivo lo admite
        if ('vibrate' in navigator) {
            try { navigator.vibrate([15, 30, 15]); } catch (e) {}
        }

        // Animación de entrada fluida
        requestAnimationFrame(() => {
            banner.classList.add('vivotv-update-visible');
        });

        // Botón Actualizar
        const btnApply = banner.querySelector('#btnApplyUpdate');
        btnApply.onclick = async () => {
            btnApply.disabled = true;
            btnApply.innerHTML = `
                <span class="update-spinner"></span>
                <span>Actualizando...</span>
            `;

            try {
                // 1. Enviar skipWaiting al Service Worker en espera
                const workerToActivate = waitingWorker || this.swRegistration?.waiting;
                if (workerToActivate) {
                    workerToActivate.postMessage({ type: 'SKIP_WAITING' });
                }

                // 2. Limpiar caches del navegador para no retener nada viejo
                if ('caches' in window) {
                    const keys = await caches.keys();
                    await Promise.all(keys.map(k => caches.delete(k)));
                }

                // 3. Guardar timestamp actual en storage
                if (this.currentVersion?.buildTime) {
                    localStorage.setItem('vivotv_installed_build_time', this.currentVersion.buildTime.toString());
                }

                // 4. Timeout de seguridad: Si no dispara controllerchange en 400ms, recargar directamente
                setTimeout(() => {
                    window.location.reload();
                }, 400);

            } catch (e) {
                console.warn('[UpdateNotifier] Error al aplicar actualización:', e);
                window.location.reload();
            }
        };

        // Botón Posponer
        const btnDismiss = banner.querySelector('#btnDismissUpdate');
        btnDismiss.onclick = () => {
            banner.classList.remove('vivotv-update-visible');
            banner.classList.add('vivotv-update-hiding');
            setTimeout(() => {
                banner.remove();
                this.isPromptShown = false;
            }, 300);
        };
    },

    /**
     * Sondeo periódico contra /version.json para entornos sin SW o PWA
     */
    initVersionPolling() {
        // Chequeo inicial tras 2 segundos
        setTimeout(() => this.checkVersionJson(), 2000);

        // Chequeo recurrente cada 8 minutos
        if (this.checkInterval) clearInterval(this.checkInterval);
        this.checkInterval = setInterval(() => {
            this.checkVersionJson();
            if (this.swRegistration) {
                this.swRegistration.update().catch(() => {});
            }
        }, 8 * 60 * 1000);
    },

    /**
     * Cuando el usuario vuelve a la pestaña o abre la app de nuevo en su celular
     */
    setupVisibilityListener() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.checkVersionJson();
                if (this.swRegistration) {
                    this.swRegistration.update().catch(() => {});
                }
            }
        });
    },

    /**
     * Compara la versión local contra el servidor
     */
    async checkVersionJson() {
        try {
            const res = await fetch(`./version.json?_t=${Date.now()}`, {
                cache: 'no-store',
                headers: { 'Pragma': 'no-cache' }
            });
            if (!res.ok) return;

            const data = await res.json();
            this.currentVersion = data;

            const installedBuildTime = localStorage.getItem('vivotv_installed_build_time');
            if (!installedBuildTime) {
                // Primera visita registrada
                localStorage.setItem('vivotv_installed_build_time', data.buildTime.toString());
                return;
            }

            // Si el build en servidor es más reciente que el instalado
            if (data.buildTime > parseInt(installedBuildTime, 10)) {
                console.log(`[UpdateNotifier] Nuevo build detectado en servidor: ${data.version} (${data.buildTime})`);
                
                // Forzar al Service Worker a buscar el nuevo archivo
                if (this.swRegistration) {
                    await this.swRegistration.update().catch(() => {});
                }

                // Mostrar banner de actualización
                this.showUpdateBanner(this.swRegistration?.waiting);
            }
        } catch (err) {
            // Error de red silencioso
        }
    },

    /**
     * Forzar chequeo inmediato
     */
    async forceCheck() {
        console.log('[UpdateNotifier] Forzando chequeo manual de actualización...');
        if (this.swRegistration) {
            await this.swRegistration.update().catch(() => {});
        }
        await this.checkVersionJson();
    },

    /**
     * Estilos CSS optimizados para el banner con GPU-acceleration y Liquid Morph
     */
    injectStyles() {
        if (document.getElementById('vivotv-update-styles')) return;

        const style = document.createElement('style');
        style.id = 'vivotv-update-styles';
        style.textContent = `
            .vivotv-update-banner {
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 999999;
                max-width: 420px;
                width: calc(100% - 32px);
                background: rgba(18, 18, 22, 0.88);
                backdrop-filter: blur(20px) saturate(180%);
                -webkit-backdrop-filter: blur(20px) saturate(180%);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 16px;
                padding: 16px 18px;
                box-shadow: 0 16px 36px rgba(0, 0, 0, 0.65), 0 0 20px rgba(229, 9, 20, 0.2);
                display: flex;
                flex-direction: column;
                gap: 14px;
                opacity: 0;
                transform: translateY(25px) scale(0.97);
                transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1), transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
                pointer-events: none;
                contain: layout style;
                will-change: transform, opacity;
            }

            .vivotv-update-banner.vivotv-update-visible {
                opacity: 1;
                transform: translateY(0) scale(1);
                pointer-events: auto;
            }

            .vivotv-update-banner.vivotv-update-hiding {
                opacity: 0;
                transform: translateY(20px) scale(0.95);
            }

            .vivotv-update-content {
                display: flex;
                align-items: flex-start;
                gap: 14px;
            }

            .vivotv-update-icon-wrapper {
                position: relative;
                width: 40px;
                height: 40px;
                border-radius: 12px;
                background: linear-gradient(135deg, rgba(229, 9, 20, 0.2), rgba(249, 115, 22, 0.2));
                border: 1px solid rgba(229, 9, 20, 0.4);
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }

            .vivotv-update-icon {
                font-size: 1.25rem;
                line-height: 1;
            }

            .vivotv-update-pulse {
                position: absolute;
                inset: -2px;
                border-radius: 14px;
                border: 2px solid rgba(229, 9, 20, 0.6);
                animation: vivotv-pulse-ring 2s infinite cubic-bezier(0.215, 0.61, 0.355, 1);
                pointer-events: none;
            }

            @keyframes vivotv-pulse-ring {
                0% { transform: scale(0.95); opacity: 0.8; }
                50% { transform: scale(1.15); opacity: 0; }
                100% { transform: scale(1.15); opacity: 0; }
            }

            .vivotv-update-text {
                display: flex;
                flex-direction: column;
                gap: 3px;
                flex: 1;
            }

            .vivotv-update-title {
                font-size: 0.95rem;
                font-weight: 700;
                color: #ffffff;
                letter-spacing: -0.01em;
            }

            .vivotv-update-desc {
                font-size: 0.8rem;
                line-height: 1.35;
                color: rgba(255, 255, 255, 0.75);
            }

            .vivotv-update-actions {
                display: flex;
                align-items: center;
                justify-content: flex-end;
                gap: 10px;
            }

            .vivotv-update-btn-dismiss {
                background: transparent;
                border: 1px solid rgba(255, 255, 255, 0.15);
                color: rgba(255, 255, 255, 0.7);
                padding: 7px 14px;
                font-size: 0.8rem;
                font-weight: 500;
                border-radius: 8px;
                cursor: pointer;
                transition: background 0.2s, color 0.2s, border-color 0.2s;
            }

            .vivotv-update-btn-dismiss:hover {
                background: rgba(255, 255, 255, 0.08);
                color: #ffffff;
                border-color: rgba(255, 255, 255, 0.25);
            }

            .vivotv-update-btn-apply {
                background: linear-gradient(135deg, #e50914, #ff3d47);
                color: #ffffff;
                border: none;
                padding: 8px 18px;
                font-size: 0.82rem;
                font-weight: 700;
                border-radius: 8px;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 7px;
                box-shadow: 0 4px 14px rgba(229, 9, 20, 0.45);
                transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;
            }

            .vivotv-update-btn-apply:hover {
                transform: translateY(-1px);
                filter: brightness(1.1);
                box-shadow: 0 6px 18px rgba(229, 9, 20, 0.6);
            }

            .vivotv-update-btn-apply:active {
                transform: translateY(0);
            }

            .vivotv-update-btn-apply:disabled {
                opacity: 0.7;
                cursor: not-allowed;
            }

            .update-spinner {
                width: 14px;
                height: 14px;
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-top-color: #ffffff;
                border-radius: 50%;
                animation: vivotv-spin 0.6s linear infinite;
            }

            @keyframes vivotv-spin {
                to { transform: rotate(360deg); }
            }

            /* Adaptación Mobile Perfecta: justo encima del navbar móvil */
            @media (max-width: 768px) {
                .vivotv-update-banner {
                    bottom: 76px; /* Salva el mobile-nav */
                    right: 16px;
                    left: 16px;
                    width: auto;
                    max-width: none;
                    border-radius: 14px;
                    padding: 14px 16px;
                }
            }

            @media (prefers-reduced-motion: reduce) {
                .vivotv-update-banner {
                    transition: none;
                }
                .vivotv-update-pulse {
                    animation: none;
                }
            }
        `;
        document.head.appendChild(style);
    }
};

// Auto-inicialización
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => UPDATE_NOTIFIER.init());
    } else {
        UPDATE_NOTIFIER.init();
    }
}
