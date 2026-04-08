/**
 * utils.js — Utilidades compartidas de VivoTV
 * Centraliza funciones comunes para evitar imports circulares.
 */

/**
 * Muestra un toast de notificación temporal en pantalla.
 * @param {string} message - Mensaje a mostrar
 * @param {string} type - Tipo (success, error, warning)
 * @param {number} duration - Duración en ms (default 3000)
 */
export function showToast(message, type = 'info', duration = 3000) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    toast.textContent = message;
    
    // Quitar clases previas
    toast.className = 'toast show';
    if (type !== 'info') toast.classList.add(`toast-${type}`);

    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.className = 'toast hidden';
    }, duration);
}
