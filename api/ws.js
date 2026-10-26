// Sala de chat sencilla con WebSocket — función de Vercel (Node + ws)
// Responde en  wss://TU-PROYECTO.vercel.app/api/ws
// Sin base de datos, sin caché, sin historial: todo vive en memoria.
//
// Protocolo (JSON):
//   cliente -> servidor: { tipo: "entrar", nombre }
//   cliente -> servidor: { tipo: "mensaje", texto }
//   servidor -> todos:   { tipo: "mensaje", nombre, texto, hora }
//   servidor -> todos:   { tipo: "sistema", texto, hora }
//   servidor -> todos:   { tipo: "usuarios", lista: ["Ana", "Pedro"] }

import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";

// Cada conexión abierta: socket -> nombre
const clientes = new Map();

const hora = () =>
  new Date().toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Santiago",
  });

// Broadcast: reenviar a TODOS los conectados
function difundir(dato) {
  const texto = JSON.stringify(dato);
  for (const socket of clientes.keys()) {
    if (socket.readyState === WebSocket.OPEN) socket.send(texto);
  }
}

const avisarUsuarios = () =>
  difundir({ tipo: "usuarios", lista: [...clientes.values()] });

// Petición HTTP normal (navegador): texto simple para comprobar que está vivo
const server = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end(`Servidor de chat TICS316 activo. Conectados: ${clientes.size}\n`);
});

const wss = new WebSocketServer({ server, maxPayload: 4096 });

wss.on("connection", (socket) => {
  socket.on("message", (crudo) => {
    let datos;
    try {
      datos = JSON.parse(crudo.toString());
    } catch {
      return; // ignoramos lo que no sea JSON
    }

    if (datos.tipo === "entrar") {
      if (clientes.has(socket)) return;
      const nombre = String(datos.nombre ?? "").trim().slice(0, 20) || "Anónimo";
      clientes.set(socket, nombre);
      difundir({ tipo: "sistema", texto: `${nombre} se unió al chat`, hora: hora() });
      avisarUsuarios();
    } else if (datos.tipo === "mensaje") {
      const nombre = clientes.get(socket);
      if (!nombre) return; // primero hay que "entrar"
      const texto = String(datos.texto ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
      if (!texto) return;
      difundir({ tipo: "mensaje", nombre, texto, hora: hora() });
    }
  });

  const salir = () => {
    const nombre = clientes.get(socket);
    if (nombre === undefined) return;
    clientes.delete(socket);
    difundir({ tipo: "sistema", texto: `${nombre} salió del chat`, hora: hora() });
    avisarUsuarios();
  };
  socket.on("close", salir);
  socket.on("error", salir);
});

export default server;
