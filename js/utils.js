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
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-premium toast-${type}`;
    
    const icon = type === 'success' ? '✅' : (type === 'error' ? '❌' : (type === 'warning' ? '⚠️' : 'ℹ️'));
    
    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
    `;
    
    container.appendChild(toast);
    
    // Trigger animation
    requestAnimationFrame(() => toast.classList.add('show'));
    
    setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 500);
    }, duration);
}
