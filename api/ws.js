// Servidor de chat grupal con WebSocket — Función de Vercel (Node + ws)
// Responde en  wss://TU-PROYECTO.vercel.app/api/ws
//
// Protocolo (todo viaja como JSON):
//   cliente -> servidor: { tipo: "entrar",  nombre, reconexion? }
//   cliente -> servidor: { tipo: "mensaje", texto }
//   servidor -> todos:   { tipo: "mensaje", nombre, texto, hora }
//   servidor -> todos:   { tipo: "sistema", texto, hora }
//   servidor -> todos:   { tipo: "usuarios", lista: ["Ana", "Pedro"] }
//   servidor -> nuevo:   { tipo: "historial", mensajes: [...] }
//
// Importante en Vercel: cada conexión queda pegada a UNA instancia de la función,
// y una instancia no ve las conexiones de otra. Si defines REDIS_URL (o KV_URL),
// las instancias se comunican por Redis y todos ven a todos. Sin Redis el chat
// funciona en memoria (basta para probar, pero solo si Vercel usa una instancia).

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import Redis from "ioredis";

const MAX_TEXTO = 300;
const MAX_NOMBRE = 20;
const MAX_HISTORIAL = 30;
const GRACIA_SALIDA_MS = 5000; // espera antes de avisar "salió" (por reconexiones)
const LATIDO_MS = 20000;
const CANAL = "chat:eventos";
const K_HISTORIAL = "chat:historial";
const K_USUARIOS = "chat:usuarios";

const INSTANCIA = randomUUID().slice(0, 8);
const REDIS_URL = process.env.REDIS_URL ?? process.env.KV_URL;

// Cada conexión abierta en ESTA instancia: socket -> { id, nombre, envios }
const clientes = new Map();
const historialLocal = [];

// ---------- Redis (opcional) ----------
let pub = null;
let sub = null;
if (REDIS_URL) {
  pub = new Redis(REDIS_URL, { maxRetriesPerRequest: 3, enableReadyCheck: false });
  sub = new Redis(REDIS_URL, { enableReadyCheck: false });
  pub.on("error", (e) => console.error("redis pub:", e.message));
  sub.on("error", (e) => console.error("redis sub:", e.message));
  sub.subscribe(CANAL).catch((e) => console.error("subscribe:", e.message));
  sub.on("message", (_canal, texto) => {
    try {
      difundirLocal(JSON.parse(texto));
    } catch { /* mensaje ajeno o dañado */ }
  });
}

// ---------- utilidades ----------
const ahora = () =>
  new Date().toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Santiago",
  });

const limpiar = (texto, max) =>
  String(texto ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function enviar(socket, dato) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(dato));
}

// Reenvía a TODAS las conexiones de esta instancia
function difundirLocal(dato) {
  for (const socket of clientes.keys()) enviar(socket, dato);
}

// Broadcast: con Redis llega a todas las instancias; sin Redis, solo a esta
async function difundir(dato) {
  if (pub) await pub.publish(CANAL, JSON.stringify(dato));
  else difundirLocal(dato);
}

// ---------- historial ----------
async function guardar(m) {
  if (pub) {
    await pub
      .multi()
      .rpush(K_HISTORIAL, JSON.stringify(m))
      .ltrim(K_HISTORIAL, -MAX_HISTORIAL, -1)
      .exec();
  } else {
    historialLocal.push(m);
    if (historialLocal.length > MAX_HISTORIAL) historialLocal.shift();
  }
}

async function leerHistorial() {
  if (!pub) return historialLocal;
  const filas = await pub.lrange(K_HISTORIAL, 0, -1);
  return filas.map((f) => JSON.parse(f));
}

async function anunciar(texto) {
  const aviso = { tipo: "sistema", texto, hora: ahora() };
  await guardar(aviso);
  await difundir(aviso);
}

// ---------- usuarios en línea ----------
const miembro = (info) => `${info.id}|${info.nombre}`;

async function registrar(info) {
  if (pub) await pub.zadd(K_USUARIOS, Date.now(), miembro(info));
}

async function retirar(info) {
  if (pub) await pub.zrem(K_USUARIOS, miembro(info));
}

async function listaUsuarios() {
  if (!pub) return [...clientes.values()].map((c) => c.nombre);
  // Quitamos a quienes dejaron de dar señales (instancia que murió sin avisar)
  await pub.zremrangebyscore(K_USUARIOS, "-inf", Date.now() - 3 * LATIDO_MS);
  const filas = await pub.zrange(K_USUARIOS, 0, -1);
  return filas.map((f) => f.slice(f.indexOf("|") + 1));
}

async function difundirUsuarios() {
  await difundir({ tipo: "usuarios", lista: await listaUsuarios() });
}

// Mientras la conexión viva, renovamos su presencia (solo importa con Redis)
setInterval(() => {
  if (!pub) return;
  for (const info of clientes.values()) registrar(info).catch(() => {});
}, LATIDO_MS).unref();

// ---------- lógica de cada conexión ----------
async function entrar(socket, datos) {
  if (clientes.has(socket)) return; // ya había entrado
  const nombre = limpiar(datos.nombre, MAX_NOMBRE) || "Anónimo";
  const info = { id: randomUUID(), nombre, envios: [] };
  clientes.set(socket, info);
  enviar(socket, { tipo: "historial", mensajes: await leerHistorial() });
  // Vercel corta cada conexión a los 5 min: el cliente se reconecta solo y avisa
  // con reconexion:true para que no se repita "se unió" en el chat
  if (datos.reconexion !== true) await anunciar(`${nombre} se unió al chat`);
  await registrar(info);
  await difundirUsuarios();
}

async function mensaje(socket, datos) {
  const info = clientes.get(socket);
  if (!info) return; // primero hay que "entrar"
  const t = Date.now();
  info.envios = info.envios.filter((x) => t - x < 5000);
  if (info.envios.length >= 10) return; // máximo 10 mensajes cada 5 s
  info.envios.push(t);
  const texto = limpiar(datos.texto, MAX_TEXTO);
  if (!texto) return;
  const m = { tipo: "mensaje", nombre: info.nombre, texto, hora: ahora() };
  await guardar(m);
  await difundir(m);
}

async function nombreEnLinea(nombre) {
  return (await listaUsuarios()).includes(nombre);
}

async function salir(socket) {
  const info = clientes.get(socket);
  if (!info) return;
  clientes.delete(socket);
  await retirar(info);
  await difundirUsuarios();
  // Esperamos un momento: si la misma persona volvió (reconexión), no avisamos
  setTimeout(async () => {
    try {
      if (!(await nombreEnLinea(info.nombre))) {
        await anunciar(`${info.nombre} salió del chat`);
      }
    } catch (e) {
      console.error("salir:", e.message);
    }
  }, GRACIA_SALIDA_MS).unref();
}

// ---------- servidor HTTP + WebSocket ----------
const server = createServer((req, res) => {
  // Petición HTTP normal (navegador, comprobación): texto simple
  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end(
    `Servidor de chat TICS316 activo.\n` +
      `Modo: ${pub ? "redis (varias instancias)" : "memoria (una instancia)"}\n` +
      `Instancia: ${INSTANCIA} · conectados en esta instancia: ${clientes.size}\n`,
  );
});

const wss = new WebSocketServer({ server, maxPayload: 4096 });

wss.on("connection", (socket) => {
  socket.on("message", (crudo) => {
    let datos;
    try {
      datos = JSON.parse(crudo.toString());
    } catch {
      return; // ignoramos lo que no sea JSON válido
    }
    const tarea =
      datos?.tipo === "entrar"
        ? entrar(socket, datos)
        : datos?.tipo === "mensaje"
        ? mensaje(socket, datos)
        : null;
    tarea?.catch((e) => console.error("error:", e.message));
  });
  socket.on("close", () => salir(socket));
  socket.on("error", () => salir(socket));
});

export default server;
