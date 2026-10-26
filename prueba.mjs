// Prueba rápida: dos clientes conversan (Node 22+).  Uso: node prueba.mjs [url]
const url = process.argv[2] ?? "ws://localhost:8000";
function cliente() {
  const ws = new WebSocket(url);
  const recibidos = [];
  ws.onmessage = (e) => recibidos.push(JSON.parse(e.data));
  const abierto = new Promise((r) => (ws.onopen = () => r()));
  return { ws, recibidos, abierto };
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let fallas = 0;
const verifica = (c, m) => { console.log(c ? "OK  " : "FALLA", m); if (!c) fallas++; };

const ana = cliente(), pedro = cliente();
await Promise.all([ana.abierto, pedro.abierto]);
ana.ws.send(JSON.stringify({ tipo: "entrar", nombre: "Ana" }));
pedro.ws.send(JSON.stringify({ tipo: "entrar", nombre: "Pedro" }));
await espera(500);
ana.ws.send(JSON.stringify({ tipo: "mensaje", texto: "Hola desde Ana" }));
pedro.ws.send(JSON.stringify({ tipo: "mensaje", texto: "  Hola   Ana,   soy Pedro  " }));
pedro.ws.send(JSON.stringify({ tipo: "mensaje", texto: "   " })); // vacío: se ignora
pedro.ws.send("no es json");                                       // se ignora
await espera(500);
const msgs = (c) => c.recibidos.filter((m) => m.tipo === "mensaje");
verifica(msgs(ana).length === 2 && msgs(pedro).length === 2, "Ambos reciben los 2 mensajes");
verifica(msgs(ana).some((m) => m.texto === "Hola Ana, soy Pedro"), "Texto normalizado");
const ult = ana.recibidos.filter((m) => m.tipo === "usuarios").at(-1);
verifica(JSON.stringify(ult?.lista?.slice().sort()) === '["Ana","Pedro"]', "Lista de usuarios: Ana y Pedro");
pedro.ws.close();
await espera(500);
verifica(ana.recibidos.some((m) => m.tipo === "sistema" && m.texto.includes("Pedro salió")), "Ana ve que Pedro salió");
ana.ws.close();
process.exit(fallas ? 1 : 0);
