/* ============================================================================
   VivoTV Player - Apple TV+ Dialogue Boost Feature
   Web Audio API Highpass (85Hz) + Voice Peaking (2.5kHz) + DynamicsCompressor
   ============================================================================ */
import { showToast } from '../../utils.js';

export const AudioBoostFeature = {
    _audioCtx: null,
    _audioSource: null,
    _highpass: null,
    _voiceBoost: null,
    _compressor: null,
    _audioBoostActive: false,

    toggleAudioBoost() {
        const video = document.getElementById('videoPlayer');
        if (!video) {
            showToast('El Realce de Diálogo requiere video nativo', 'info');
            return;
        }

        try {
            if (!this._audioCtx) {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                this._audioCtx = new AudioContextClass();
                this._audioSource = this._audioCtx.createMediaElementSource(video);

                // 1. Highpass: Cuts hum below 85Hz
                this._highpass = this._audioCtx.createBiquadFilter();
                this._highpass.type = 'highpass';
                this._highpass.frequency.value = 85;

                // 2. Peaking: +5dB at vocal frequency (2.5 kHz)
                this._voiceBoost = this._audioCtx.createBiquadFilter();
                this._voiceBoost.type = 'peaking';
                this._voiceBoost.frequency.value = 2500;
                this._voiceBoost.Q.value = 1.2;
                this._voiceBoost.gain.value = 5.0;

                // 3. Dynamic Compressor: limits loud explosions and brings up whispers
                this._compressor = this._audioCtx.createDynamicsCompressor();
                this._compressor.threshold.setValueAtTime(-22, this._audioCtx.currentTime);
                this._compressor.knee.setValueAtTime(25, this._audioCtx.currentTime);
                this._compressor.ratio.setValueAtTime(8, this._audioCtx.currentTime);
                this._compressor.attack.setValueAtTime(0.005, this._audioCtx.currentTime);
                this._compressor.release.setValueAtTime(0.2, this._audioCtx.currentTime);

                this._audioSource.connect(this._highpass);
                this._highpass.connect(this._voiceBoost);
                this._voiceBoost.connect(this._compressor);
                this._compressor.connect(this._audioCtx.destination);

                this._audioBoostActive = true;
            } else {
                if (this._audioCtx.state === 'suspended') {
                    this._audioCtx.resume();
                }
                this._audioBoostActive = !this._audioBoostActive;
                if (this._voiceBoost) {
                    this._voiceBoost.gain.value = this._audioBoostActive ? 5.0 : 0;
                }
                if (this._compressor) {
                    this._compressor.ratio.setValueAtTime(this._audioBoostActive ? 8 : 1, this._audioCtx.currentTime);
                }
            }

            const btn = document.getElementById('btnAudioBoost');
            if (btn) btn.classList.toggle('active', this._audioBoostActive);

            showToast(this._audioBoostActive ? '🎙️ Diálogo Nítido Activado (Apple TV+ Boost)' : '🎙️ Audio Estándar Restablecido', 'info');
        } catch (e) {
            console.warn('[Player] AudioContext error (CORS o política de audio):', e);
            showToast('Audio Boost no disponible en esta fuente directa', 'info');
        }
    }
};
