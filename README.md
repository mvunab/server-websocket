# Servidor de chat con WebSocket (TICS316)

Servidor de chat grupal como función de Vercel (Node + `ws`). Endpoint: `wss://TU-PROYECTO.vercel.app/api/ws`.

## Protocolo

Todo viaja como JSON.

| Mensaje | Dirección | Contenido |
|---|---|---|
| entrar | cliente → servidor | `{ tipo: "entrar", nombre, reconexion? }` |
| mensaje | cliente → servidor | `{ tipo: "mensaje", texto }` |
| mensaje | servidor → todos | `{ tipo: "mensaje", nombre, texto, hora }` |
| sistema | servidor → todos | `{ tipo: "sistema", texto, hora }` |
| usuarios | servidor → todos | `{ tipo: "usuarios", lista }` |
| historial | servidor → recién llegado | `{ tipo: "historial", mensajes }` |

## Desplegar en Vercel

1. Vercel → Add New → Project → importar este repositorio → Deploy (sin cambiar nada).
2. Abrir `https://TU-PROYECTO.vercel.app/api/ws`: debe decir "Servidor de chat TICS316 activo".
3. **Recomendado: Redis.** Cada conexión queda en una instancia y no ve a las otras. En Storage / Marketplace agrega Redis (por ejemplo Upstash) y conéctalo al proyecto. El código lee `REDIS_URL` o `KV_URL` (URL TCP `rediss://`, no la REST). Vuelve a desplegar: la página debe decir "Modo: redis".

Vercel corta cada conexión a los 5 minutos en el plan Hobby; el cliente base se reconecta solo y el servidor evita avisos repetidos.

## Probar

```
npm install
npm run dev      # ws://localhost:8000
npm test         # en otra terminal; con una URL: node prueba.mjs wss://TU-PROYECTO.vercel.app/api/ws
```

También sirve en cualquier host con un proceso Node (por ejemplo Render): build `npm install`, start `node dev.js`; la URL de los clientes no lleva `/api/ws`.
