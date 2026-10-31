/* ============================================================================
   VivoTV - Auth UI & Form Handling Module
   Manages login, signup, password recovery, lockout protection, and Spanish error mapping
   ============================================================================ */
import { showToast } from '../utils.js';

let authMode = window.location.pathname.includes('registro.html') ? 'register' : 'login';

export function getAuthMode() {
    return authMode;
}

export function setAuthMode(mode) {
    authMode = mode;
}

/**
 * Translates Supabase auth exceptions into friendly Spanish messages
 */
export function mapAuthErrorToSpanish(err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('invalid login credentials') || msg.includes('invalid_grant')) {
        return 'El correo o la contraseña son incorrectos. Por favor, verifica tus credenciales.';
    }
    if (msg.includes('user already registered') || msg.includes('already exists')) {
        return 'Ya existe una cuenta registrada con este correo. Puedes iniciar sesión directamente.';
    }
    if (msg.includes('rate limit') || msg.includes('too many requests')) {
        return 'Has superado el límite de intentos. Por seguridad, espera unos minutos antes de volver a intentar.';
    }
    if (msg.includes('email not confirmed')) {
        return 'Tu cuenta requiere confirmación de correo. Revisa tu bandeja de entrada o carpeta de spam.';
    }
    if (msg.includes('password should be at least')) {
        return 'La contraseña debe contener al menos 8 caracteres.';
    }
    if (msg.includes('network error') || msg.includes('failed to fetch')) {
        return 'Error de conexión. Verifica tu conexión a internet e inténtalo nuevamente.';
    }
    return err?.message || 'Ocurrió un error inesperado al procesar la solicitud.';
}

/**
 * Switches the viewport to the Authentication card view
 */
export function toAuth(TMDB_SERVICE, CATALOG_UI) {
    const isAuthPage = window.location.pathname.endsWith('index.html') ||
                       window.location.pathname.endsWith('registro.html') ||
                       window.location.pathname === '/' ||
                       window.location.pathname.endsWith('vivoweb/');

    if (!isAuthPage) { 
        window.location.href = 'index.html'; 
        return; 
    }

    const authSection = document.getElementById('authSection');
    const dashSection = document.getElementById('dashboardSection');
    const userProfile = document.getElementById('userProfile');
    const mainNav = document.getElementById('mainNav');
    const mobileNav = document.querySelector('.mobile-nav');
    const searchBox = document.getElementById('searchBox');
    const loginForm = document.getElementById('loginForm');
    const authError = document.getElementById('authError');

    if (authSection) authSection.classList.remove('hidden');
    if (dashSection) dashSection.classList.add('hidden');
    if (userProfile) userProfile.classList.add('hidden');
    if (mainNav)     mainNav.classList.add('hidden');
    if (mobileNav) {
        mobileNav.classList.add('hidden');
        mobileNav.style.display = 'none';
    }
    if (searchBox)   searchBox.classList.add('hidden');
    if (loginForm)   loginForm.reset();
    if (authError)   authError.classList.add('hidden');

    if (TMDB_SERVICE && CATALOG_UI) {
        TMDB_SERVICE.getImagesForAuthBg().then(CATALOG_UI.renderAuthBg).catch(() => {});
    }
}

/**
 * Configures the forgot password state
 */
export function toForgotPasswordMode() {
    authMode = 'forgot';
    const authTitle = document.getElementById('authTitle');
    const authSubtitle = document.getElementById('authSubtitle');
    const passwordEl = document.getElementById('password');
    const btnText = document.getElementById('btnText');
    const authError = document.getElementById('authError');

    if (authTitle) authTitle.textContent = 'Recuperar Contraseña';
    if (authSubtitle) authSubtitle.textContent = 'Ingresa tu correo electrónico para recibir un enlace de recuperación';
    
    const passGroup = passwordEl ? passwordEl.closest('.input-group') : null;
    if (passGroup) passGroup.classList.add('hidden');
    
    const forgotContainer = document.querySelector('.forgot-link-container');
    if (forgotContainer) forgotContainer.classList.add('hidden');
    
    if (btnText) btnText.textContent = 'Enviar Enlace';
    
    const authToggle = document.querySelector('.auth-toggle');
    if (authToggle) {
        authToggle.innerHTML = '¿Recordaste tu contraseña? <a href="#" id="backToLogin">Inicia sesión</a>';
        const backToLoginBtn = document.getElementById('backToLogin');
        if (backToLoginBtn) {
            backToLoginBtn.onclick = (e) => {
                e.preventDefault();
                toLoginMode();
            };
        }
    }
    
    if (authError) authError.classList.add('hidden');
}

/**
 * Configures the normal login mode
 */
export function toLoginMode() {
    authMode = 'login';
    const authTitle = document.getElementById('authTitle');
    const authSubtitle = document.getElementById('authSubtitle');
    const passwordEl = document.getElementById('password');
    const btnText = document.getElementById('btnText');

    if (authTitle) authTitle.textContent = 'Inicia Sesión';
    if (authSubtitle) authSubtitle.textContent = 'Disfruta de tus canales en vivo y catálogo premium';
    
    const passGroup = passwordEl ? passwordEl.closest('.input-group') : null;
    if (passGroup) passGroup.classList.remove('hidden');
    
    const forgotContainer = document.querySelector('.forgot-link-container');
    if (forgotContainer) forgotContainer.classList.remove('hidden');
    
    if (btnText) btnText.textContent = 'Iniciar Sesión';
    
    const authToggle = document.querySelector('.auth-toggle');
    if (authToggle) {
        authToggle.innerHTML = '¿No tienes cuenta? <a href="registro.html" id="toggleAuthMode">Regístrate gratis</a>';
    }
}

/**
 * Renders the password reset form when arriving from recovery email
 */
export function showResetPasswordForm() {
    authMode = 'reset';
    const authSection = document.getElementById('authSection');
    const dashSection = document.getElementById('dashboardSection');
    const userProfile = document.getElementById('userProfile');
    const mainNav = document.getElementById('mainNav');
    const mobileNav = document.querySelector('.mobile-nav');

    if (authSection) authSection.classList.remove('hidden');
    if (dashSection) dashSection.classList.add('hidden');
    if (userProfile) userProfile.classList.add('hidden');
    if (mainNav) mainNav.classList.add('hidden');
    if (mobileNav) mobileNav.classList.add('hidden');

    const authCard = document.querySelector('.auth-card');
    if (authCard) {
        authCard.innerHTML = `
            <div class="auth-header" style="text-align: center; margin-bottom: 24px;">
                <h2 style="font-size: 1.8rem; font-weight: 700; color: #fff;">Crear Nueva Contraseña</h2>
                <p style="color: #94a3b8; font-size: 0.95rem; margin-top: 6px;">Ingresa tu nueva contraseña para acceder a VivoTV.</p>
            </div>
            <form id="resetPasswordForm" class="auth-form" onsubmit="return false;">
                <div class="input-group">
                    <label for="password" style="display:block; margin-bottom:6px; color:#cbd5e1; font-size:0.9rem;">Nueva Contraseña</label>
                    <input type="password" id="password" class="auth-input" placeholder="Mínimo 8 caracteres" required minlength="8" style="width:100%; padding:12px 14px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); border-radius:8px; color:#fff;">
                </div>
                <div class="input-group" style="margin-top:16px;">
                    <label for="confirmPassword" style="display:block; margin-bottom:6px; color:#cbd5e1; font-size:0.9rem;">Confirmar Contraseña</label>
                    <input type="password" id="confirmPassword" class="auth-input" placeholder="Repite la contraseña" required minlength="8" style="width:100%; padding:12px 14px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); border-radius:8px; color:#fff;">
                </div>
                <div id="authError" class="auth-error-msg hidden" style="color: #ef4444; font-size: 0.9rem; margin-top: 12px; text-align: center;"></div>
                <button type="submit" id="btnSubmitReset" class="btn btn-primary btn-block" style="width:100%; margin-top:20px; padding:12px; background:linear-gradient(135deg, #bb86fc, #9d4edd); border:none; border-radius:8px; font-weight:700; color:#fff; cursor:pointer;">
                    Guardar Contraseña
                </button>
            </form>
        `;
        const btnReset = document.getElementById('btnSubmitReset');
        if (btnReset) {
            btnReset.onclick = (e) => handleAuthAction(e, { supabase: window.supabase });
        }
    }
}

/**
 * Central auth submit handler with anti-brute-force defense
 */
export async function handleAuthAction(e, { supabase, setLoading }) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    const emailEl = document.getElementById('email');
    const passwordEl = document.getElementById('password');
    const usernameEl = document.getElementById('username');
    const btnSubmit = document.getElementById('btnSubmit');
    const btnText = document.getElementById('btnText');
    const btnLoader = document.getElementById('btnLoader');
    const authError = document.getElementById('authError');

    if (typeof setLoading === 'function') {
        setLoading(true, btnSubmit, btnText, btnLoader);
    }
    if (authError) authError.classList.add('hidden');

    try {
        if (authMode === 'forgot') {
            const email = emailEl?.value.trim();
            if (!email) throw new Error('Por favor, ingresa tu correo electrónico.');
            
            const { error } = await supabase.auth.resetPasswordForEmail(email, { 
                redirectTo: window.location.origin + window.location.pathname 
            });
            if (error) throw error;
            
            const authCard = document.querySelector('.auth-card');
            if (authCard) {
                authCard.innerHTML = `
                    <div class="registration-success-ui" style="text-align:center; padding:30px 10px;">
                        <div class="success-icon" style="font-size:3rem; margin-bottom:16px;">📩</div>
                        <h3 style="font-size:1.4rem; margin-bottom:8px; color:#fff;">¡Enlace enviado!</h3>
                        <p style="color:#94a3b8; font-size:0.95rem; margin-bottom:20px;">Revisa tu bandeja de entrada en: <strong>${email}</strong> para restablecer tu contraseña.</p>
                        <button class="btn btn-primary btn-block" onclick="window.location.reload()">Regresar</button>
                    </div>
                `;
            }
            showToast('📩 Enlace de recuperación enviado al correo.', 'success');
        } else if (authMode === 'reset') {
            const password = passwordEl?.value;
            const confirmPassword = document.getElementById('confirmPassword')?.value;
            
            if (!password || !confirmPassword) throw new Error('Por favor, completa todos los campos.');
            if (password !== confirmPassword) throw new Error('Las contraseñas no coinciden.');
            if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
            
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            
            const authCard = document.querySelector('.auth-card');
            if (authCard) {
                authCard.innerHTML = `
                    <div class="registration-success-ui" style="text-align:center; padding:30px 10px;">
                        <div class="success-icon" style="font-size:3rem; margin-bottom:16px;">✅</div>
                        <h3 style="font-size:1.4rem; margin-bottom:8px; color:#fff;">Contraseña Actualizada</h3>
                        <p style="color:#94a3b8; font-size:0.95rem; margin-bottom:20px;">Tu contraseña ha sido actualizada con éxito.</p>
                    </div>
                `;
            }
            showToast('✅ Contraseña actualizada con éxito.', 'success');
            setTimeout(async () => {
                await supabase.auth.signOut();
                localStorage.removeItem('vivotv_current_profile');
                sessionStorage.removeItem('vivotv_profile_chosen');
                window.location.reload();
            }, 3000);
        } else if (authMode === 'login') {
            const email = emailEl?.value.trim();
            const password = passwordEl?.value;
            if (!email || !password) throw new Error('Por favor, completa tu correo y contraseña.');

            // Anti brute-force lock
            const now = Date.now();
            if (window._authLockoutUntil && now < window._authLockoutUntil) {
                const waitSecs = Math.ceil((window._authLockoutUntil - now) / 1000);
                throw new Error(`Demasiados intentos erróneos. Por seguridad, espera ${waitSecs} segundos.`);
            }

            if (btnSubmit) btnSubmit.classList.add('btn-loading');
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) {
                if (btnSubmit) btnSubmit.classList.remove('btn-loading');
                window._failedAuthAttempts = (window._failedAuthAttempts || 0) + 1;
                if (window._failedAuthAttempts >= 5) {
                    window._authLockoutUntil = Date.now() + 30000;
                    window._failedAuthAttempts = 0;
                    throw new Error('Demasiados intentos erróneos. Cuenta bloqueada temporalmente por 30 segundos.');
                }
                throw error;
            }
            window._failedAuthAttempts = 0;
            window._authLockoutUntil = 0;

            document.body.classList.add('page-exit-fade');
            setTimeout(() => {
                window.location.href = 'profiles.html';
            }, 300);
        } else {
            const email = emailEl?.value.trim();
            const password = passwordEl?.value;
            if (!email || !password) throw new Error('Por favor, completa todos los campos.');
            if (password.length < 8) throw new Error('Por seguridad, la contraseña debe tener al menos 8 caracteres.');

            const confirmPassEl = document.getElementById('confirmPassword');
            if (confirmPassEl && confirmPassEl.value && confirmPassEl.value !== password) {
                throw new Error('Las contraseñas no coinciden.');
            }

            const username = usernameEl ? usernameEl.value.trim() : 'Usuario';
            const { error } = await supabase.auth.signUp({ 
                email, 
                password,
                options: { data: { username, name: username } }
            });
            if (error) throw error;
            
            const authCard = document.querySelector('.auth-card');
            if (authCard) {
                authCard.innerHTML = `
                    <div class="registration-success-ui" style="text-align:center; padding:30px 10px;">
                        <div class="success-icon" style="font-size:3rem; margin-bottom:16px;">📩</div>
                        <h3 style="font-size:1.4rem; margin-bottom:8px; color:#fff;">¡Cuenta creada con éxito!</h3>
                        <p style="color:#94a3b8; font-size:0.95rem; margin-bottom:20px;">Revisa tu bandeja de entrada en: <strong style="color:#bb86fc;">${email}</strong> para activar tu acceso.</p>
                        <button class="btn btn-primary btn-block" onclick="window.location.href='index.html'">Ir a Iniciar Sesión</button>
                    </div>
                `;
            }
            showToast('📩 Revisa tu correo para activar tu cuenta de VivoTV.', 'success');
        }
    } catch (err) {
        const spanishMsg = mapAuthErrorToSpanish(err);
        if (authError) {
            authError.textContent = spanishMsg;
            authError.classList.remove('hidden');
        }
        showToast(spanishMsg, 'error');
    } finally {
        if (typeof setLoading === 'function') {
            setLoading(false, btnSubmit, btnText, btnLoader);
        }
    }
}

/**
 * Attaches event listeners for all authentication forms
 */
export function setupAuthListeners(context) {
    const btnSubmit = document.getElementById('btnSubmit');
    const loginForm = document.getElementById('loginForm');
    const emailEl = document.getElementById('email');
    const passwordEl = document.getElementById('password');

    const onSubmit = (e) => handleAuthAction(e, context);

    if (btnSubmit) {
        btnSubmit.onclick = onSubmit;
    }

    if (loginForm) {
        loginForm.onsubmit = onSubmit;
        loginForm.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) onSubmit(e);
        };
    }

    if (!window._authGlobalListenerBound) {
        window._authGlobalListenerBound = true;
        document.addEventListener('click', (e) => {
            if (e.target.closest('#btnSubmit')) {
                onSubmit(e);
            }
        });
    }

    if (emailEl) {
        emailEl.oninput = () => {
            const val = emailEl.value.trim();
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (val.length > 0 && !emailRegex.test(val)) {
                emailEl.style.borderColor = 'rgba(239, 68, 68, 0.7)';
            } else if (emailRegex.test(val)) {
                emailEl.style.borderColor = 'rgba(16, 185, 129, 0.7)';
                const authError = document.getElementById('authError');
                if (authError) authError.classList.add('hidden');
            } else {
                emailEl.style.borderColor = '';
            }
        };
    }

    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    const groupUsername = document.getElementById('groupUsername');
    const passStrengthContainer = document.getElementById('passStrengthContainer');
    const linkForgotPassword = document.getElementById('linkForgotPassword');
    const authTitle = document.getElementById('authTitle');
    const authSubtitle = document.getElementById('authSubtitle');
    const btnText = document.getElementById('btnText');
    const authError = document.getElementById('authError');

    if (tabLogin && tabRegister) {
        tabLogin.onclick = () => {
            tabLogin.classList.add('active');
            tabRegister.classList.remove('active');
            authMode = 'login';
            if (authTitle) authTitle.textContent = 'Iniciar Sesión';
            if (authSubtitle) authSubtitle.textContent = 'Accede a tus canales en vivo, maratones y lista de favoritos';
            if (groupUsername) groupUsername.style.display = 'none';
            if (passStrengthContainer) passStrengthContainer.style.display = 'none';
            if (btnText) btnText.textContent = 'Iniciar Sesión';
            if (authError) authError.classList.add('hidden');
        };

        tabRegister.onclick = () => {
            tabRegister.classList.add('active');
            tabLogin.classList.remove('active');
            authMode = 'register';
            if (authTitle) authTitle.textContent = 'Crea tu cuenta gratuita';
            if (authSubtitle) authSubtitle.textContent = 'Únete a la mejor experiencia de streaming en 4K Ultra HD';
            if (groupUsername) groupUsername.style.display = 'block';
            if (passStrengthContainer) passStrengthContainer.style.display = 'block';
            if (btnText) btnText.textContent = 'Crear Cuenta';
            if (authError) authError.classList.add('hidden');
        };
    }

    if (linkForgotPassword) {
        linkForgotPassword.onclick = (e) => {
            e.preventDefault();
            toForgotPasswordMode();
        };
    }
}
