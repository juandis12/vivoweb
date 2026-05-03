/**
 * watch-party-guide.js — Guía interactiva para la función Watch Party
 * Implementación Vanilla JS con diseño premium.
 */

export class WatchPartyGuide {
    constructor() {
        this.currentStep = 0;
        this.steps = [
            {
                title: "¡Bienvenido a Watch Party!",
                text: "Ahora puedes disfrutar de tus películas favoritas con amigos en tiempo real, sin importar dónde estén.",
                img: "assets/info-help-btn.png"
            },
            {
                title: "1. Crea tu Sala",
                text: "Haz clic en el botón de Watch Party en cualquier película. Tú serás el anfitrión y controlarás la reproducción.",
                img: "assets/info-help-btn.png"
            },
            {
                title: "2. Comparte el Enlace",
                text: "Copia el enlace generado y envíalo a tus amigos. Solo necesitan tener una cuenta activa para unirse.",
                img: "assets/info-help-btn.png"
            },
            {
                title: "3. ¡Listos para la Acción!",
                text: "Cuando tus amigos se unan, la reproducción se sincronizará automáticamente. ¡Disfruten la función!",
                img: "assets/info-help-btn.png"
            }
        ];
        this.modal = null;
    }

    show() {
        if (this.modal) return;
        this.render();
        document.body.classList.add('no-scroll');
    }

    hide() {
        if (!this.modal) return;
        this.modal.classList.add('fade-out');
        setTimeout(() => {
            document.body.removeChild(this.modal);
            this.modal = null;
            document.body.classList.remove('no-scroll');
        }, 300);
    }

    next() {
        if (this.currentStep < this.steps.length - 1) {
            this.currentStep++;
            this.update();
        } else {
            this.hide();
        }
    }

    prev() {
        if (this.currentStep > 0) {
            this.currentStep--;
            this.update();
        }
    }

    update() {
        const step = this.steps[this.currentStep];
        const titleEl = this.modal.querySelector('.guide-title');
        const textEl = this.modal.querySelector('.guide-text');
        const imgEl = this.modal.querySelector('.guide-img');
        const dots = this.modal.querySelectorAll('.guide-dot');

        titleEl.textContent = step.title;
        textEl.textContent = step.text;
        imgEl.src = step.img;

        dots.forEach((dot, index) => {
            dot.classList.toggle('active', index === this.currentStep);
        });

        const nextBtn = this.modal.querySelector('.btn-next');
        nextBtn.textContent = this.currentStep === this.steps.length - 1 ? '¡Entendido!' : 'Siguiente';
        
        const prevBtn = this.modal.querySelector('.btn-prev');
        prevBtn.style.visibility = this.currentStep === 0 ? 'hidden' : 'visible';
    }

    render() {
        this.currentStep = 0;
        const step = this.steps[0];
        
        const modalHtml = `
            <div class="guide-overlay">
                <div class="guide-modal">
                    <button class="guide-close" id="closeGuide">&times;</button>
                    <div class="guide-content">
                        <div class="guide-img-container">
                            <img src="${step.img}" alt="Guía" class="guide-img">
                        </div>
                        <h2 class="guide-title">${step.title}</h2>
                        <p class="guide-text">${step.text}</p>
                        <div class="guide-dots">
                            ${this.steps.map((_, i) => `<div class="guide-dot ${i === 0 ? 'active' : ''}"></div>`).join('')}
                        </div>
                    </div>
                    <div class="guide-footer">
                        <button class="btn-guide btn-skip" id="skipGuide">Saltar tour</button>
                        <div class="guide-nav-buttons">
                            <button class="btn-guide btn-prev" id="prevStep" style="visibility: hidden">Anterior</button>
                            <button class="btn-guide btn-next" id="nextStep">Siguiente</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const wrapper = document.createElement('div');
        wrapper.innerHTML = modalHtml.trim();
        this.modal = wrapper.firstChild;
        document.body.appendChild(this.modal);

        // Listeners
        this.modal.querySelector('#closeGuide').onclick = () => this.hide();
        this.modal.querySelector('#skipGuide').onclick = () => this.hide();
        this.modal.querySelector('#nextStep').onclick = () => this.next();
        this.modal.querySelector('#prevStep').onclick = () => this.prev();
    }
}
