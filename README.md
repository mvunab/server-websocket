# Sala de chat sencilla con WebSocket (TICS316)

Servidor mínimo como función de Vercel (Node + `ws`). Endpoint: `wss://TU-PROYECTO.vercel.app/api/ws`.
Sin base de datos, sin caché y sin historial: todo vive en memoria.

## Protocolo (JSON)

| Mensaje | Dirección | Contenido |
|---|---|---|
| entrar | cliente → servidor | `{ tipo: "entrar", nombre }` |
| mensaje | cliente → servidor | `{ tipo: "mensaje", texto }` |
| mensaje | servidor → todos | `{ tipo: "mensaje", nombre, texto, hora }` |
| sistema | servidor → todos | `{ tipo: "sistema", texto, hora }` |
| usuarios | servidor → todos | `{ tipo: "usuarios", lista }` |

## Desplegar en Vercel

Vercel → Add New → Project → importar este repositorio → Deploy (sin cambiar nada).
Al abrir `https://TU-PROYECTO.vercel.app/api/ws` debe decir "Servidor de chat TICS316 activo".

Límites a tener presente: Vercel corta cada conexión a los 5 minutos (plan Hobby; el cliente base se reconecta solo) y, como todo está en memoria, si Vercel crea varias instancias cada una tiene su propia sala. Para una clase pequeña normalmente basta una.

## Probar

```
npm install
npm run dev      # ws://localhost:8000
npm test         # en otra terminal; o: node prueba.mjs wss://TU-PROYECTO.vercel.app/api/ws
```

La versión con Redis, historial y reconexión sin avisos repetidos está en el commit `f98d8a8`.
