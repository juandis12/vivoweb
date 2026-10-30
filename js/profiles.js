/* ============================================================================
   VivoTV - Profiles Module (Extracted from profiles.html)
   ============================================================================ */
import { CONFIG, supabase } from './config.js';
import { showToast } from './utils.js';

        let isEditing = false;
        let profiles = [];
        let updateTimers = {}; // Para debounce por perfil

        const DEFAULT_PROFILES = [
            { name: 'Principal', color: 'color-1', is_kids: false },
            { name: 'Niños', color: 'color-2', is_kids: true },
            { name: 'Invitado', color: 'color-3', is_kids: false }
        ];

        const grid = document.getElementById('profilesGrid');
        const mainSubtitle = document.getElementById('mainSubtitle');

        const selectionContainer = document.getElementById('selectionContainer');
        const firstProfileContainer = document.getElementById('firstProfileContainer');
        const setupNameInput = document.getElementById('setupName');
        const setupAvatar = document.getElementById('setupAvatar');
        const btnCreateFirst = document.getElementById('btnCreateFirst');

        const avatarModal = document.getElementById('avatarModal');
        const avatarGrid = document.getElementById('avatarGrid');
        const btnCancelAvatar = document.getElementById('btnCancelAvatar');
        const btnAdmin = document.getElementById('btnAdmin');
        const btnFinish = document.getElementById('btnFinish');
        const bodyRoot = document.getElementById('bodyRoot');
        const mainTitle = document.getElementById('mainTitle');

        let currentEditingProfileId = null;

        const AVATAR_LIST = [
            { id: 'spiderman', name: 'Spider-man', theme: 'Marvel', url: 'assets/avatars/avatar_spiderman.png' },
            { id: 'ironman', name: 'Iron Man', theme: 'Marvel', url: 'assets/avatars/avatar_ironman.png' },
            { id: 'wanda', name: 'Wanda', theme: 'Marvel', url: 'assets/avatars/avatar_wanda.png' },
            { id: 'scott', name: 'Scott McCall', theme: 'Teen Wolf', url: 'assets/avatars/avatar_scott.png' },
            { id: 'damon', name: 'Damon', theme: 'TVD', url: 'assets/avatars/avatar_damon.png' },
            { id: 'elena', name: 'Elena', theme: 'TVD', url: 'assets/avatars/avatar_elena.png' },
            { id: 'tanjiro', name: 'Tanjiro', theme: 'Anime', url: 'assets/avatars/avatar_tanjiro.png' },
            { id: 'woody', name: 'Woody', theme: 'Pixar', url: 'assets/avatars/avatar_woody.png' },
            { id: 'vivotv_3d', name: 'VivoTV 3D', theme: 'VIVOTV', url: 'assets/avatars/avatar_vivotv_3d.png' },
            { id: 'stranger_things', name: 'Stranger Things', theme: 'Netflix', url: 'assets/avatars/avatar_stranger_things.png' },
            { id: 'la_casa_de_papel', name: 'Dali', theme: 'Netflix', url: 'assets/avatars/avatar_la_casa_de_papel.png' },
            { id: 'el_juego_del_calamar', name: 'Squid Game', theme: 'Netflix', url: 'assets/avatars/avatar_el_juego_del_calamar.png' },
            { id: 'stormtrooper', name: 'Stormtrooper', theme: 'Star Wars', url: 'assets/avatars/avatar_stormtrooper.png' },
            { id: 'marvel_shield', name: 'Cap Shield', theme: 'Marvel', url: 'assets/avatars/avatar_marvel_shield.png' },
            { id: 'cine_premium', name: 'Cinema 3D', theme: 'Premium', url: 'assets/avatars/avatar_cine_premium.png' },
            { id: 'anime_premium', name: 'Anime 3D', theme: 'Premium', url: 'assets/avatars/avatar_anime_premium.png' },
            { id: 'gamer_premium', name: 'Gamer 3D', theme: 'Premium', url: 'assets/avatars/avatar_gamer_premium.png' },
            { id: 'popcorn_premium', name: 'Golden Popcorn', theme: 'Premium', url: 'assets/avatars/avatar_popcorn_premium.png' }
        ];

        // --- CARGA DESDE DB (Fase 15: Server Synced) ---
        let globalServerNow = new Date();

        async function loadProfilesFromDB() {
            try {
                if (window.location.protocol === 'file:') {
                    console.error('[Protección CORS] No puedes abrir la app directamente desde el archivo. Usa un servidor local (Live Server).');
                    showToast('⚠️ Error de seguridad: Usa Live Server para cargar los perfiles.', 'error', 8000);
                    return;
                }

                // 0. Estrategia de recuperación de sesión híbrida
                console.log('[VivoTV] Verificando sesión de usuario...');
                
                // Primero intentamos getSession (Instantáneo/Local)
                let { data: { session }, error: sessionError } = await supabase.auth.getSession();
                
                // Si getSession falla o está vacío, intentamos getUser (Network check)
                if (sessionError || !session) {
                    console.log('[VivoTV] getSession no devolvió nada, intentando getUser...');
                    const { data: userData, error: authError } = await supabase.auth.getUser();
                    if (userData?.user) {
                        session = { user: userData.user };
                    }
                }

                const user = session?.user;

                if (!user) {
                    console.warn('[VivoTV] No se detectó ninguna sesión activa. Redirigiendo al login...');
                    
                    // Solo limpiamos si estamos seguros de que no hay sesión
                    localStorage.removeItem('vivotv_current_profile');
                    sessionStorage.clear();
                    
                    window.location.href = 'index.html';
                    return;
                }

                // 1. Obtener perfiles directamente filtrando por el usuario actual
                console.log('[VivoTV] Cargando perfiles de la DB...');
                const { data: dbData, error: dbError } = await supabase
                    .from('vivotv_profiles')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: true });

                if (dbError) {
                    console.error('[VivoTV] Error cargando perfiles:', dbError);
                    showToast('Error cargando los perfiles.', 'error');
                    
                    // Falla crítica: Mostrar mensaje en el grid para no dejar la pantalla en blanco
                    grid.innerHTML = `
                        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #ff9800;">
                            <p style="font-size: 1.5rem; margin-bottom: 10px;">⚠️ Problema de conexión</p>
                            <p style="opacity: 0.7;">No pudimos conectar con Supabase. Reintentando en unos segundos...</p>
                        </div>
                    `;
                    selectionContainer.style.display = 'block'; 
                    return;
                }

                profiles = dbData || [];

                // 2. Obtener tiempo de servidor (Sync)
                try {
                    const { data: syncData } = await supabase.rpc('vivotv_get_profiles_synced');
                    if (syncData && syncData.server_now) {
                        globalServerNow = new Date(syncData.server_now);
                    } else {
                        globalServerNow = new Date();
                    }
                } catch (e) {
                    console.warn('[Sync] RPC no disponible, usando hora local.');
                    globalServerNow = new Date();
                }

                if (profiles && profiles.length > 0) {
                    selectionContainer.style.display = 'block';
                    firstProfileContainer.classList.remove('active');
                    renderProfiles();
                } else {
                    selectionContainer.style.display = 'none';
                    firstProfileContainer.classList.add('active');
                    setupNameInput.focus();
                }
            } catch (err) {
                console.error('[Critical Error] loadProfilesFromDB crashed:', err);
                showToast('Error crítico al cargar perfiles. Por favor, recarga la página.', 'error');
            }
        }

        function resolveAvatarUrl(url) {
            if (!url) return '';
            if (url.startsWith('http')) return url;
            if (url.startsWith('assets/avatars/')) return url;
            // Si es solo el nombre (ej: avatar_ironman.png), añadir ruta
            return `assets/avatars/${url}`;
        }

        function renderProfiles() {
            grid.innerHTML = '';

            if (profiles.length === 0 && !isEditing) {
                mainTitle.textContent = "¡Bienvenido a VivoTV!";
                mainSubtitle.textContent = "Crea tu primer perfil para empezar a disfrutar.";
            }

            profiles.forEach(p => {
                if (!p || !p.name) return; // Saltar perfiles sin nombre (evita crash)

                const item = document.createElement('div');
                item.className = 'profile-item';
                
                const initial = p.name ? p.name[0].toUpperCase() : '?';

                item.innerHTML = `
                    <div class="profile-avatar ${p.color || 'color-1'}">
                        <span class="profile-avatar-initial">${initial}</span>
                        ${p.avatar_url ? `<img src="${resolveAvatarUrl(p.avatar_url)}" alt="${p.name}" onerror="this.remove()">` : ''}
                        ${p.is_kids ? '<span class="kids-badge">Niños</span>' : ''}
                        ${_isOccupied(p) ? `
                            <div class="occupied-badge">EN USO</div>
                            ${p.now_playing ? `
                                <div class="playback-status-card">
                                    <div class="playback-status-header">
                                        <span class="playback-icon">🎥</span>
                                        <span class="playback-label">VIENDO AHORA</span>
                                    </div>
                                    <div class="playback-title">${p.now_playing.title}</div>
                                    <div class="playback-time">${p.now_playing.formattedTime}</div>
                                </div>
                            ` : ''}
                            <button class="release-btn" onclick="forceRelease('${p.id}')">LIBERAR</button>
                        ` : ''}
                        <div class="edit-overlay" onclick="openProfileSettings('${p.id}')">
                            <div class="edit-icon-btn">✏️</div>
                        </div>
                    </div>
                    <div class="profile-name">${p.name}</div>
                `;

                if (_isOccupied(p)) item.classList.add('occupied');

                item.onclick = (e) => {
                    if (isEditing) return;
                    if (e.target.closest('.release-btn')) return;
                    selectProfile(p);
                };
                grid.appendChild(item);
            });

            // --- BOTÓN AGREGAR PERFIL (Solo si < 4 y en modo admin o vacío) ---
            if (profiles.length < 4 && (isEditing || profiles.length === 0)) {
                const addBtn = document.createElement('div');
                addBtn.className = 'profile-item add-profile-item';
                addBtn.innerHTML = `
                    <div class="profile-avatar add-avatar">
                        <span class="add-icon">+</span>
                    </div>
                    <div class="profile-name-input" style="pointer-events: none;">Agregar Perfil</div>
                `;
                addBtn.onclick = addNewProfile;
                grid.appendChild(addBtn);
            }
        }

        window.addNewProfile = async () => {
            const name = prompt("Nombre del nuevo perfil (máx 15 caracteres):");
            if (!name || name.trim() === "") return;

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const randomColor = `color-${Math.floor(Math.random() * 4) + 1}`;

            const { error } = await supabase
                .from('vivotv_profiles')
                .insert([{
                    user_id: user.id,
                    name: name.trim(),
                    color: randomColor,
                    is_kids: false
                }]);

            if (error) {
                console.error(error);
                showToast("Error al crear el perfil", "error");
            } else {
                showToast("Perfil creado con éxito", "success");
                loadProfilesFromDB();
            }
        };

        function _isOccupied(p, nowOverride = null) {
            if (!p.last_heartbeat) return false;

            // --- CÁLCULO DE PRECISIÓN (Fase Auditoria) ---
            const last = new Date(p.last_heartbeat).getTime();
            const now = (nowOverride || globalServerNow).getTime();

            const diff = (now - last) / 1000;
            // Un perfil está ocupado si el latido ocurrió en los últimos 30 segundos
            // Quitamos la restricción diff >= 0 para mayor tolerancia a microsincronización
            return diff < 30;
        }

        window.forceRelease = async (id) => {
            // --- VERIFICACIÓN DE SEGURIDAD PRE-VUELO (Fase 17) ---
            // Consultamos la DB directamente para evitar el lag de la UI
            const { data: freshProfile, error: fetchError } = await supabase
                .from('vivotv_profiles')
                .select('now_playing')
                .eq('id', id)
                .single();

            if (fetchError) {
                console.error('Error verificando estado para liberación:', fetchError);
                return;
            }

            if (freshProfile && freshProfile.now_playing && freshProfile.now_playing.title) {
                showToast(`🔒 BLOQUEO ACTIVADO: No puedes liberar este perfil porque está viendo: "${freshProfile.now_playing.title}".`, 'error', 8000);
                // Forzamos actualización de la UI para que se vea el cambio
                loadProfilesFromDB();
                return;
            }

            if (!confirm('¿Deseas liberar este perfil a la fuerza? Se cerrará la sesión en el otro dispositivo.')) return;

            // 1. Liberar en DB para persistencia
            const { error } = await supabase.rpc('vivotv_release_session', { pid: id });

            // 2. Enviar señal de expulsión inmediata por Broadcast (Relay Robusto)
            const channel = supabase.channel(`kickout-${id}`, {
                config: { 
                    broadcast: { self: false, ack: true } 
                }
            });

            console.log(`[Realtime] Intentando suscribir para expulsión: kickout-${id}`);

            channel.subscribe(async (status) => {
                console.log(`[Realtime] Estado suscripción expulsión: ${status}`);
                if (status === 'SUBSCRIBED') {
                    console.log(`[Realtime] Enviando señal de expulsión...`);
                    const resp = await channel.send({
                        type: 'broadcast',
                        event: 'FORCE_EXIT',
                        payload: { profileId: id }
                    });
                    
                    console.log(`[Realtime] Respuesta de envío broadcast:`, resp);
                    
                    // Dejamos el canal abierto un poco más para asegurar entrega
                    setTimeout(() => {
                        console.log(`[Realtime] Cerrando canal temporal de expulsión.`);
                        supabase.removeChannel(channel);
                    }, 5000);
                }
            });

            if (!error) {
                showToast('Se ha enviado la señal de liberación inmediata.', 'success');
                loadProfilesFromDB();
            }
        };
        window._isOccupied = _isOccupied; // Hacerlo global por si acaso

        window.updateProfileName = (id, newName) => {
            const p = profiles.find(x => x.id === id);
            if (!p) return;

            p.name = newName;

            // --- OPTIMIZACIÓN: DEBOUNCE (Fase 11) ---
            clearTimeout(updateTimers[id]);
            updateTimers[id] = setTimeout(async () => {
                const { error } = await supabase
                    .from('vivotv_profiles')
                    .update({ name: newName })
                    .eq('id', id);

                if (error) {
                    console.error('[VivoTV] Error:', error);
                    showToast('Error al sincronizar nombre', 'error');
                } else {
                    showToast(`Sincronizado: ${newName}`, 'success', 1000);
                }
            }, 800);
        };

        window.updateKidsMode = async (id, checked) => {
            const p = profiles.find(x => x.id === id);
            if (p) {
                p.is_kids = checked;
                const { error } = await supabase
                    .from('vivotv_profiles')
                    .update({ is_kids: checked })
                    .eq('id', id);

                if (error) {
                    showToast('Error al cambiar modo parental', 'error');
                } else {
                    showToast(checked ? 'Modo Niños activado' : 'Perfil habilitado para todo público', 'info');
                    renderProfiles();
                }
            }
        };

        // --- GESTIÓN DE SELECCIÓN CONSOLIDADA ---

        // ==========================================================
        // SISTEMA DE PIN ESTILO iOS (Fase 17: Premium Experience)
        // ==========================================================
        let currentPin = '';
        let pinResolve = null;
        let pinReject = null;
        const pinModal = document.getElementById('pinModal');

        /**
         * Abre el teclado numérico iOS y resuelve una promesa con el PIN ingresado.
         * @param {string} title - El título a mostrar en el modal (ej: "Introduce tu código")
         */
        window.showPinPad = (title) => {
            return new Promise((resolve) => {
                const headerText = document.getElementById('pinHeaderText');
                if (headerText) {
                    headerText.textContent = title || "Desliza hacia arriba para Face ID o usa el código";
                }
                currentPin = '';
                updatePinDots();
                pinModal.classList.add('active');
                pinResolve = resolve;
            });
        };

        window.closePinPad = () => {
            pinModal.classList.remove('active');
            if (pinResolve) pinResolve(null);
            pinResolve = null;
        };

        window.handlePinKey = (val) => {
            if (val === 'back') {
                currentPin = currentPin.slice(0, -1);
            } else if (currentPin.length < 4) {
                currentPin += val;

                // Animación visual de la tecla (Flash blanco)
                const keyEl = document.querySelector(`.pin-key[data-key="${val}"]`);
                if (keyEl) {
                    keyEl.classList.add('active');
                    setTimeout(() => keyEl.classList.remove('active'), 150);
                }
            }

            updatePinDots();

            if (currentPin.length === 4) {
                const result = currentPin;
                setTimeout(() => {
                    pinModal.classList.remove('active');
                    if (pinResolve) pinResolve(result);
                    pinResolve = null;
                }, 150);
            }
        };

        function updatePinDots() {
            const dots = document.querySelectorAll('#pinDots .dot');
            dots.forEach((dot, idx) => {
                dot.classList.toggle('filled', idx < currentPin.length);
            });
        }

        /**
         * Realiza una animación de vibración (shake) en caso de error.
         */
        window.shakePinPad = () => {
            const content = document.getElementById('pinContent');
            content.classList.add('shake');
            currentPin = '';
            updatePinDots();
            setTimeout(() => content.classList.remove('shake'), 400);
        };

        // Escucha de teclado físico (Optimizado para PC)
        document.addEventListener('keydown', (e) => {
            if (!pinModal.classList.contains('active')) return;

            if (e.key >= '0' && e.key <= '9') {
                handlePinKey(e.key);
            } else if (e.key === 'Backspace') {
                handlePinKey('back');
            } else if (e.key === 'Escape') {
                closePinPad();
            }
        });

        // ==========================================================
        // GESTIÓN DE PERFILES Y PIN
        // ==========================================================
        function playCinematicChime() {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                const ctx = new AudioCtx();
                if (ctx.state === 'suspended') ctx.resume();

                const now = ctx.currentTime;
                // 1. Deep Sub-bass rumble (C2 ~ 65.4Hz)
                const subOsc = ctx.createOscillator();
                const subGain = ctx.createGain();
                subOsc.type = 'sine';
                subOsc.frequency.setValueAtTime(65.4, now);
                subOsc.frequency.exponentialRampToValueAtTime(45, now + 1.2);
                subGain.gain.setValueAtTime(0.3, now);
                subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
                subOsc.connect(subGain);
                subGain.connect(ctx.destination);
                subOsc.start(now);
                subOsc.stop(now + 1.4);

                // 2. Luxurious chord harmonics (C3, G3, C4, E4)
                [130.81, 196.00, 261.63, 329.63].forEach((freq, idx) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = idx === 0 ? 'triangle' : 'sine';
                    osc.frequency.setValueAtTime(freq, now + 0.04);
                    gain.gain.setValueAtTime(0.0001, now);
                    gain.gain.linearRampToValueAtTime(0.16 / (idx + 1), now + 0.12);
                    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.7);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(now);
                    osc.stop(now + 1.7);
                });
            } catch (e) {
                console.warn('[Audio] Cinematic chime blocked or unsupported:', e);
            }
        }
        window.selectProfile = async (p) => {
            if (isEditing) return;

            // 1. Re-verificar ocupación antes de entrar (Seguridad 10X)
            const { data: syncData } = await supabase.rpc('vivotv_get_profiles_synced');
            if (syncData && syncData.profiles) {
                const dbP = syncData.profiles.find(x => x.id === p.id);
                const freshNow = new Date(syncData.server_now);

                if (dbP && _isOccupied(dbP, freshNow)) {
                    showToast("❌ Este perfil se acaba de ocupar. Elige otro.", "error");
                    profiles = syncData.profiles;
                    renderProfiles();
                    return;
                }

                // Usar la versión más fresca del perfil si es posible
                if (dbP) p = dbP;
            }

            // 2. Validar Biometría si existe (Prioridad sobre PIN)
            if (p.biometric_key && window.PublicKeyCredential) {
                try {
                    const challenge = new Uint8Array(32);
                    window.crypto.getRandomValues(challenge);
                    
                    const assertion = await navigator.credentials.get({
                        publicKey: {
                            challenge: challenge,
                            timeout: 60000,
                            userVerification: "required"
                        }
                    });

                    if (assertion) {
                        console.log('[Biometría] Acceso concedido');
                    }
                } catch (e) {
                    console.warn('[Biometría] Falló o cancelado, pidiendo PIN si existe.');
                    if (p.pin) {
                         const entered = await showPinPad(`🔒 Perfil Protegido`);
                         if (entered === null) return;
                         if (entered !== p.pin) { shakePinPad(); showToast("PIN incorrecto", "error"); return; }
                    } else if (p.biometric_key) {
                        return; // Si solo tenía biometría y falló, no entra.
                    }
                }
            } else if (p.pin) {
                // 3. Validar PIN si existe usando el nuevo sistema iOS
                const entered = await showPinPad(`🔒 Perfil Protegido`);
                if (entered === null) return; // Cancelado

                if (entered !== p.pin) {
                    shakePinPad();
                    showToast("PIN incorrecto", "error");
                    return;
                }
            }

            // --- SINCRONIZACIÓN GLOBAL (Fase 20) ---
            try {
                await supabase.auth.updateUser({
                    data: { last_profile_id: p.id }
                });
            } catch (e) {
                console.warn('[Sync] Falló la actualización de metadatos:', e);
            }

            // --- ANIMACIÓN DE BIENVENIDA (NETFLIX STYLE) ---
            const welcomeOverlay = document.getElementById('welcomeIntro');
            const welcomeAvatar  = document.getElementById('welcomeAvatar');
            const welcomeName    = document.getElementById('welcomeName');

            // Preparar el avatar para la intro
            if (p.avatar_url) {
                let displayUrl = p.avatar_url;
                if (!displayUrl.startsWith('http') && !displayUrl.startsWith('assets/avatars/')) {
                    displayUrl = `assets/avatars/${displayUrl}`;
                }
                welcomeAvatar.innerHTML = `<img src="${displayUrl}" style="width:100%;height:100%;object-fit:cover;">`;
                welcomeAvatar.className = 'welcome-avatar-w';
            } else {
                welcomeAvatar.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:4rem;color:white;">${p.name[0]}</div>`;
                welcomeAvatar.className = `welcome-avatar-w ${p.color || 'color-1'}`;
            }

            welcomeName.textContent = `BIENVENIDO DE NUEVO, ${p.name.toUpperCase()}`;
            welcomeOverlay.classList.add('active');
            playCinematicChime();

            // Guardar sesión
            localStorage.setItem('vivotv_current_profile', JSON.stringify(p));
            sessionStorage.setItem('vivotv_profile_chosen', 'true');

            // Esperar a que la animación termine antes de redirigir
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 2200);
        };

        window.manageProfilePin = async (id) => {
            const p = profiles.find(x => x.id === id);
            if (!p) return;

            // 1. Si ya tiene PIN, pedir el antiguo
            if (p.pin) {
                const old = await showPinPad("Introduce PIN actual");
                if (old === null) return;
                if (old !== p.pin) {
                    shakePinPad();
                    showToast("PIN incorrecto", "error");
                    return;
                }
            }

            // 2. Pedir el nuevo PIN
            const newPin = await showPinPad("Nuevo PIN de 4 dígitos");
            if (!newPin) return;

            // 3. Confirmar nuevo PIN
            const confirmPin = await showPinPad("Confirma el nuevo PIN");
            if (newPin === confirmPin) {
                p.pin = newPin;
                const { error } = await supabase
                    .from('vivotv_profiles')
                    .update({ pin: newPin })
                    .eq('id', id);
                if (error) {
                    showToast("Error guardando PIN.", "error");
                    console.error(error);
                } else {
                    showToast("PIN actualizado con éxito.", "success");
                    renderProfiles();
                }
            } else {
                showToast("Los PINs no coinciden.", "warning");
            }
        };

        // --- FASE 4: BIOMETRÍA (WEB_AUTHN) ---
        window.setupBiometrics = async (profileId) => {
            const p = profiles.find(x => x.id === profileId);
            if (!p) return;

            if (!window.PublicKeyCredential) {
                showToast("Tu navegador no soporta biometría", "error");
                return;
            }

            try {
                showToast("Prepara tu sensor de huella o FaceID...", "info");
                
                // Generar desafío local (Simple para esta versión)
                const challenge = new Uint8Array(32);
                window.crypto.getRandomValues(challenge);

                const credential = await navigator.credentials.create({
                    publicKey: {
                        challenge: challenge,
                        rp: { name: "VivoTV" },
                        user: {
                            id: new Uint8Array(p.id.split('-').map(x => parseInt(x, 16)).slice(0, 16)),
                            name: p.name,
                            displayName: p.name
                        },
                        pubKeyCredParams: [{ alg: -7, type: "public-key" }],
                        timeout: 60000,
                        attestation: "direct"
                    }
                });

                if (credential) {
                    const keyString = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
                    const { error } = await supabase
                        .from('vivotv_profiles')
                        .update({ biometric_key: keyString })
                        .eq('id', profileId);
                    
                    if (!error) {
                        showToast("¡Biometría configurada con éxito!", "success");
                        p.biometric_key = keyString;
                        renderProfiles();
                    }
                }
            } catch (e) {
                console.error('Biometric error:', e);
                showToast("Cancelado o error en sensor", "warning");
            }
        };

        btnAdmin.onclick = () => {
            isEditing = true;
            bodyRoot.classList.add('admin-mode');
            btnAdmin.classList.add('hidden');
            btnFinish.classList.remove('hidden');
            mainTitle.textContent = 'Administrar Perfiles';
            mainSubtitle.textContent = 'Edita nombres y configura los filtros parentales.';
            renderProfiles();
        };

        btnFinish.onclick = async () => {
            isEditing = false;
            bodyRoot.classList.remove('admin-mode');
            btnFinish.classList.add('hidden');
            btnAdmin.classList.remove('hidden');
            document.getElementById('btnLogoutGlobal').classList.remove('hidden');
            mainTitle.textContent = '¿Quién está viendo?';
            mainSubtitle.textContent = 'Selecciona un perfil para empezar a disfrutar.';

            // Forzar recarga final
            await loadProfilesFromDB();
        };

        document.getElementById('btnLogoutGlobal').onclick = async () => {
            if (confirm('¿Estás seguro de que deseas cerrar sesión en esta cuenta?')) {
                sessionStorage.clear();
                await supabase.auth.signOut();
                window.location.href = 'index.html';
            }
        };

        btnAdmin.addEventListener('click', () => {
            document.getElementById('btnLogoutGlobal').classList.add('hidden');
        });

        btnFinish.addEventListener('click', () => {
            document.getElementById('btnLogoutGlobal').classList.remove('hidden');
        });

        // --- LÓGICA DE BIENVENIDA ---
        setupNameInput.oninput = (e) => {
            const val = e.target.value.trim();
            setupAvatar.textContent = val ? val[0].toUpperCase() : "?";
        };

        btnCreateFirst.onclick = async () => {
            const name = setupNameInput.value.trim();
            if (!name) {
                showToast("Por favor, ingresa un nombre", "warning");
                return;
            }

            btnCreateFirst.disabled = true;
            btnCreateFirst.textContent = "Creando...";

            const { data: { user } } = await supabase.auth.getUser();
            const randomColor = `color-${Math.floor(Math.random() * 4) + 1}`;

            const { data, error } = await supabase
                .from('vivotv_profiles')
                .insert([{
                    user_id: user.id,
                    name: name,
                    color: randomColor,
                    is_kids: false
                }])
                .select()
                .single();

            if (error) {
                showToast("Error al crear perfil", "error");
                btnCreateFirst.disabled = false;
                btnCreateFirst.textContent = "Empezar a disfrutar";
            } else {
                // Usar el sistema de selección con animación
                selectProfile(data);
            }
        };

        // --- SISTEMA DE AJUSTES PREMIUM (Fase 18) ---
        window.openProfileSettings = (pid) => {
            const p = profiles.find(x => x.id === pid);
            if (!p) return;

            currentEditingProfileId = pid;
            const modal = document.getElementById('settingsModal');
            const avatarImg = document.getElementById('settingsAvatarImg');
            const nameInput = document.getElementById('settingsNameInput');
            const kidsToggle = document.getElementById('settingsKidsToggle');
            const pinStatus = document.getElementById('settingsPinStatus');
            const bioStatus = document.getElementById('settingsBioStatus');
            const pinBtn = document.getElementById('settingsPinBtn');
            const bioBtn = document.getElementById('settingsBioBtn');

            // Avatar
            avatarImg.innerHTML = p.avatar_url ? `<img src="${p.avatar_url}" style="width:100%;height:100%;object-fit:cover;">` : p.name[0];
            avatarImg.parentElement.className = `settings-avatar-w ${p.avatar_url ? '' : p.color}`;
            
            // Name
            nameInput.value = p.name;
            nameInput.oninput = (e) => updateProfileName(pid, e.target.value);

            // Kids Mode
            kidsToggle.checked = p.is_kids;
            kidsToggle.onchange = (e) => updateKidsMode(pid, e.target.checked);

            // PIN
            pinStatus.textContent = p.pin ? 'Protegido con código' : 'Sin seguridad activa';
            pinBtn.textContent = p.pin ? 'Cambiar' : 'Activar';
            pinBtn.onclick = () => manageProfilePin(pid);

            // Bio
            bioStatus.textContent = p.biometric_key ? 'Biometría configurada' : 'Disponible';
            bioBtn.textContent = p.biometric_key ? 'Actualizar' : 'Activar';
            bioBtn.onclick = () => setupBiometrics(pid);

            modal.classList.add('active');
        };

        window.closeSettingsModal = () => {
            document.getElementById('settingsModal').classList.remove('active');
            renderProfiles();
        };

        window.openAvatarFromSettings = () => {
            openAvatarPicker(currentEditingProfileId);
        };

        window.logoutGlobal = async () => {
            sessionStorage.clear();
            await supabase.auth.signOut();
            window.location.href = 'index.html';
        };

        // --- SISTEMA DE AVATARES ---
        function openAvatarPicker(profileId) {
            if (!isEditing) return;
            currentEditingProfileId = profileId;
            renderAvatarGrid();
            avatarModal.classList.add('active');
        }

        function renderAvatarGrid() {
            avatarGrid.innerHTML = '';
            const p = profiles.find(x => x.id === currentEditingProfileId);
            // Normalizar el avatar_url actual para comparación correcta
            const currentAvatar = p?.avatar_url ? p.avatar_url.split('/').pop() : null;

            AVATAR_LIST.forEach(av => {
                const avatarFilename = av.url.split('/').pop();
                const opt = document.createElement('div');
                opt.className = `avatar-option ${currentAvatar === avatarFilename ? 'selected' : ''}`;
                opt.innerHTML = `<img src="${av.url}" class="avatar-img-choice" title="${av.name} (${av.theme})">`;
                opt.onclick = () => selectAvatar(av.url);
                avatarGrid.appendChild(opt);
            });
        }

        async function selectAvatar(url) {
            const id = currentEditingProfileId;
            avatarModal.classList.remove('active');

            showToast("Guardando avatar...", "info");

            // --- NORMALIZACIÓN CROSS-PLATFORM ---
            // Guardar solo el nombre del archivo (ej: 'avatar_ironman.png')
            // para que Flutter y la Web usen el mismo valor en la DB.
            const normalizedUrl = url.split('/').pop();

            const { error } = await supabase
                .from('vivotv_profiles')
                .update({ avatar_url: normalizedUrl })
                .eq('id', id);

            if (error) {
                console.error('[VivoTV] Supabase Error:', error);

                if (error.message && error.message.includes('column "avatar_url" of relation "vivotv_profiles" does not exist')) {
                    showToast("❌ Error: Debes ejecutar el script SQL en Supabase para habilitar avatares.", "error", 8000);
                } else {
                    showToast("Error al guardar avatar: " + error.message, "error");
                }
            } else {
                // Actualizar localmente solo si el server confirmó
                const p = profiles.find(x => x.id === id);
                if (p) p.avatar_url = normalizedUrl;

                showToast("Avatar actualizado con éxito", "success");
                renderProfiles();
            }
        }

        btnCancelAvatar.onclick = () => avatarModal.classList.remove('active');

        // Iniciar carga y refresco automático cada 10s
        loadProfilesFromDB().finally(() => {
            // CRÍTICO: Añadir clase 'loaded' para que styles.css (body { opacity: 0 }) 
            // permita ver la página. Sin esto, la pantalla se queda negra.
            document.body.classList.add('loaded');
        });

        setInterval(() => {
            // Poll constante incluso si está vacío (para detectar nuevos perfiles)
            loadProfilesFromDB();
        }, 10000);
