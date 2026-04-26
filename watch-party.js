/**
 * watch-party.js — Motor de Sincronización Realtime para VivoTV
 * Gestiona salas de visualización compartida usando Supabase Channels.
 */

import { showToast } from './utils.js';

export class WatchPartyManager {
    constructor(supabase, userId, profileName) {
        this.supabase = supabase;
        this.userId = userId;
        this.profileName = profileName;
        this.currentChannel = null;
        this.currentPartyId = null;
        this.isHost = false;
        this.onSyncCallback = null;
    }

    /**
     * Crea una nueva sala para el contenido actual
     */
    async createParty(tmdbId, mediaType) {
        try {
            const { data, error } = await this.supabase
                .from('vivotv_watch_parties')
                .insert([{
                    creator_id: this.userId,
                    creator_name: this.profileName,
                    tmdb_id: tmdbId,
                    media_type: mediaType,
                    is_playing: false,
                    room_time: 0
                }])
                .select()
                .single();

            if (error) throw error;

            this.currentPartyId = data.id;
            this.isHost = true;
            this.initChannel(data.id);
            
            showToast('¡Sala de Watch Party creada!', 'success');
            return data.id;
        } catch (e) {
            console.error('[WatchParty] Error creando sala:', e);
            showToast('Error al crear la sala', 'error');
            return null;
        }
    }

    /**
     * Se une a una sala existente
     */
    async joinParty(partyId) {
        try {
            console.log(`[WatchParty] Intentando unirse a sala: ${partyId}`);
            
            const { data, error } = await this.supabase
                .from('vivotv_watch_parties')
                .select('*')
                .eq('id', partyId)
                .maybeSingle();

            if (error) {
                console.error('[WatchParty] Error de Supabase al leer la sala:', error);
                throw new Error('Error al buscar la sala en la base de datos (Posible RLS o permisos)');
            }
            if (!data) {
                console.error('[WatchParty] La sala no existe o ya fue eliminada por el host.');
                throw new Error('La sala no existe o fue eliminada');
            }

            this.currentPartyId = partyId;
            this.isHost = false;
            this.initChannel(partyId);

            showToast(`Unido a la sala de ${data.creator_name}`, 'success');
            return data;
        } catch (e) {
            console.error('[WatchParty] Error en joinParty:', e.message || e);
            showToast('No se pudo unir a la sala', 'error');
            return null;
        }
    }

    /**
     * Inicializa el canal de realtime (Broadcast + Presence)
     */
    initChannel(partyId) {
        if (this.currentChannel) this.supabase.removeChannel(this.currentChannel);

        this.currentChannel = this.supabase.channel(`party:${partyId}`, {
            config: { broadcast: { self: false } }
        });

        this.currentChannel
            .on('broadcast', { event: 'sync' }, ({ payload }) => {
                if (!this.isHost && this.onSyncCallback) {
                    this.onSyncCallback(payload);
                }
            })
            .on('broadcast', { event: 'emote' }, ({ payload }) => {
                // Dispara un evento global para que la UI lo dibuje en pantalla
                window.dispatchEvent(new CustomEvent('vivotv:party_emote', { detail: payload }));
            })
            .on('presence', { event: 'sync' }, () => {
                const state = this.currentChannel.presenceState();
                console.log('[WatchParty] Usuarios en sala:', state);
                // Aquí se podría disparar un evento para mostrar avatar de quienes están
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await this.currentChannel.track({
                        user: this.profileName,
                        online_at: new Date().toISOString(),
                    });
                }
            });
    }

    /**
     * El HOST envía su estado a todos los invitados
     */
    broadcastSync(currentTime, isPlaying) {
        if (!this.isHost || !this.currentChannel) return;

        this.currentChannel.send({
            type: 'broadcast',
            event: 'sync',
            payload: { currentTime, isPlaying, timestamp: Date.now() }
        });
    }

    /**
     * Registra el callback para cuando el invitado reciba un sync
     */
    onSync(callback) {
        this.onSyncCallback = callback;
    }

    /**
     * El HOST o GUEST envía un Emote (Reacción) a toda la sala
     */
    broadcastEmote(emote) {
        if (!this.currentChannel) return;

        this.currentChannel.send({
            type: 'broadcast',
            event: 'emote',
            payload: { emote, sender: this.profileName, timestamp: Date.now() }
        });
        
        // Auto-dibujar el emote para el remitente
        window.dispatchEvent(new CustomEvent('vivotv:party_emote', { 
            detail: { emote, sender: this.profileName } 
        }));
    }

    /**
     * Cierra la sala
     */
    async leaveParty() {
        if (this.isHost && this.currentPartyId) {
            await this.supabase.from('vivotv_watch_parties').delete().eq('id', this.currentPartyId);
        }
        
        if (this.currentChannel) {
            this.supabase.removeChannel(this.currentChannel);
        }

        this.currentPartyId = null;
        this.currentChannel = null;
        this.isHost = false;
        showToast('Has salido de la sala');
    }
}
