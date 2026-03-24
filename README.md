# Frontend - VoiceBot Historico

Aplicacion Vue + Vite para la interfaz del voicebot historico. En este link podran ver la app adaptada a escritorio y móvil `https://voicebot-test.netlify.app/`

## Requisitos

- Node.js 18 o superior
- npm 9 o superior
- Backend corriendo en `http://localhost:3000` y `https://voicebot-backend-awh4.onrender.com`. Tomar en cuenta que render baja el server por inactividad
## Variables de entorno

Este proyecto usa un archivo `.env` local.

1. Copia el archivo de ejemplo:

```powershell
Copy-Item .env.example .env
```

2. Ajusta la variable si hace falta:

```env
VITE_API_URL=
```

Notas:
- Si `VITE_API_URL` se deja vacía, el frontend usa rutas relativas como `/api/...`.
- Si el backend corre en otro host o puerto, coloca la URL completa, por ejemplo:

```env
VITE_API_URL=http://localhost:3000
```

## Instalacion

```powershell
npm install
```

## Correr en desarrollo

```powershell
npm run dev
```

Vite levantara la aplicacion en una URL local, normalmente `http://localhost:5173`.

## Build de produccion

```powershell
npm run build
```

## Vista previa del build

```powershell
npm run preview
```

## Flujo esperado

- El frontend inicia una sesion de voz con OpenAI Realtime.
- Las consultas historicas se resuelven contra el backend.
- El backend devuelve saludo, 1 hecho historico de Muffinlabs y manejo de favoritos.
- El panel lateral permite ver y eliminar favoritos guardados de la sesion.

## Archivos importantes

- `src/App.vue`: flujo principal de interfaz, voz y favoritos
- `src/style.css`: estilos y responsive
- `.env.example`: variables de entorno de referencia
