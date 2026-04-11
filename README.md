# VivoTV (VivoWeb) — Premium Streaming Experience

[![Vercel Deployment](https://img.shields.io/badge/Deploy-Vercel-black?style=flat&logo=vercel)](https://vivoweb-liart.vercel.app)
[![Supabase](https://img.shields.io/badge/Backend-Supabase-3ECF8E?style=flat&logo=supabase)](https://supabase.com)
[![Design](https://img.shields.io/badge/System-Abyssal_Navy-001F3F?style=flat)](./styles.css)

**VivoTV** es una plataforma de streaming de alta fidelidad diseñada para ofrecer una experiencia de usuario fluida, segura y visualmente impactante. Construida sobre una arquitectura SPA (Single Page Application) moderna, aprovecha el poder de Supabase para la gestión de datos en tiempo real y TMDB para un catálogo global enriquecido.

🔗 **Producción:** [https://vivoweb-liart.vercel.app](https://vivoweb-liart.vercel.app)

---

## 🚀 Características Principales

### 1. Sistema de Diseño "Abyssal Navy"
- Interfaz premium optimizada para PC y dispositivos móviles.
- Animaciones suaves de cristalografía (glassmorphism) e interacciones magnéticas.
- Dashboard dinámico con carga progresiva de metadatos.

### 2. Arquitectura de Sesión Robusta
- **Centralized Auth:** Gestión de identidad unificada a través de `auth.js`.
- **Multi-Perfil:** Soporte para hasta 4 perfiles con protección por PIN y personalización visual.
- **Control de Concurrencia:** Límite estricto de 2 dispositivos simultáneos controlado en tiempo real vía Supabase Realtime.

### 3. Motor de Catálogo Híbrido (Turbo Sync)
- **Sincronización Progresiva:** Escaneo profundo de la base de datos local cruzado con la API de TMDB.
- **Pool de Trabajadores:** Descarga de metadatos en segundo plano utilizando un pool de alta concurrencia (Turbo Sync) para asegurar carga instantánea.
- **Validación Multi-Tabla:** Verificación en tiempo real de disponibilidad de fuentes de video y episodios.

### 4. Experiencia Social y Playback
- **Watch Party (FASE 4):** Sincronización de visualización en tiempo real entre múltiples usuarios.
- **Reproductor Universal:** Soporte paraHLS (m3u8), YouTube e integraciones de terceros.
- **Telemetría en Vivo:** Seguimiento de estado de reproducción para reanudación precisa.

---

## 🛠️ Stack Tecnológico

- **Frontend:** Vanilla JS (SPA Engine), CSS Moderno, Hls.js.
- **BaaS/Database:** [Supabase](https://supabase.com) (Auth, PostgreSQL, Realtime, RPC).
- **Metadata:** [TMDB API v3](https://www.themoviedb.org/documentation/api).
- **Hosting:** [Vercel](https://vercel.com).

---

## 📂 Estructura del Proyecto

- `index.html`: Punto de entrada principal y Shell de la aplicación.
- `app.js`: Cerebro de la aplicación, orquesta el Dashboard y la lógica SPA.
- `auth.js`: Motor de autenticación unificado y gestión de perfiles.
- `catalog.js`: Motor de sincronización, filtrado y validación de contenido.
- `layout.js`: Sistema de navegación SPA y renderizado dinámico de secciones.
- `config.js`: Variables de entorno y configuración de servicios.

---

## 🛠️ Desarrollo Local

```bash
# Clonar el proyecto
git clone https://github.com/juandis12/vivoweb.git

# Lanzar servidor de desarrollo (recomendado: Live Server o similar)
# No requiere compilación (Native ESM)
```

---

## 📄 Notas de Versión (Fase Actual)
- ✅ Estabilización de sesiones duplicadas ("Lock stolen" fixed).
- ✅ Implementación de Singleton en servicio Supabase.
- ✅ Optimización de errores 404 en Turbo Sync.
- 🚧 Finalización de Watch Party UI.

---
© 2026 VivoTV Team. Prohibida su reproducción total o parcial sin autorización.
