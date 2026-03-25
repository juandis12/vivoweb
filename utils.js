/**
 * utils.js — Utilidades compartidas de VivoTV
 * Centraliza funciones comunes para evitar imports circulares.
 */

/**
 * Muestra un toast de notificación temporal en pantalla.
 * @param {string} message - Mensaje a mostrar
 * @param {number} duration - Duración en ms (default 3000)
 */
export function showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('hidden');
    }, duration);
}
