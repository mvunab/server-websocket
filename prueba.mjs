// Prueba automática: dos clientes conversan contra el servidor (Node 22+)
// Uso:  node prueba.mjs [urlA] [urlB]   (con dos URL prueba dos instancias distintas)
const urlA = process.argv[2] ?? "ws://localhost:8000";
const urlB = process.argv[3] ?? urlA;

function cliente(url) {
  const ws = new WebSocket(url);
  const recibidos = [];
  ws.onmessage = (e) => recibidos.push(JSON.parse(e.data));
  const abierto = new Promise((r) => (ws.onopen = () => r()));
  return { ws, recibidos, abierto };
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let fallas = 0;
const verifica = (c, m) => { console.log(c ? "OK  " : "FALLA", m); if (!c) fallas++; };

const ana = cliente(urlA);
const pedro = cliente(urlB);
await Promise.all([ana.abierto, pedro.abierto]);
ana.ws.send(JSON.stringify({ tipo: "entrar", nombre: "Ana" }));
await espera(300);
pedro.ws.send(JSON.stringify({ tipo: "entrar", nombre: "Pedro" }));
await espera(300);
ana.ws.send(JSON.stringify({ tipo: "mensaje", texto: "Hola desde Ana" }));
await espera(300);
pedro.ws.send(JSON.stringify({ tipo: "mensaje", texto: "  Hola   Ana,   soy Pedro  " }));
pedro.ws.send(JSON.stringify({ tipo: "mensaje", texto: "   " })); // vacío: se ignora
pedro.ws.send("no es json"); // se ignora
await espera(300);

const msgs = (c) => c.recibidos.filter((m) => m.tipo === "mensaje");
verifica(msgs(ana).length === 2, "Ana recibe 2 mensajes (el suyo y el de Pedro)");
verifica(msgs(ana)[1]?.texto === "Hola Ana, soy Pedro", "Texto normalizado");
verifica(msgs(pedro).length === 2, "Pedro recibe ambos mensajes");
verifica(pedro.recibidos.some((m) => m.tipo === "historial"), "Pedro recibe historial al entrar");
const ultU = (c) => c.recibidos.filter((m) => m.tipo === "usuarios").at(-1);
verifica(JSON.stringify(ultU(ana)?.lista?.slice().sort()) === '["Ana","Pedro"]', "Ana ve a Ana y Pedro en línea");

// Reconexión rápida de Pedro: no debe avisar "salió" ni "se unió"
pedro.ws.close();
await espera(500);
const pedro2 = cliente(urlB);
await pedro2.abierto;
pedro2.ws.send(JSON.stringify({ tipo: "entrar", nombre: "Pedro", reconexion: true }));
await espera(6000); // más que la gracia de salida
const avisos = ana.recibidos.filter((m) => m.tipo === "sistema").map((m) => m.texto);
verifica(!avisos.some((t) => t.includes("Pedro salió")), "Reconexión rápida: sin aviso de salida");
verifica(avisos.filter((t) => t.includes("Pedro se unió")).length === 1, "Reconexión rápida: sin segundo aviso de entrada");
verifica(pedro2.recibidos.some((m) => m.tipo === "historial" && m.mensajes.length >= 2), "Pedro reconectado recupera el historial");

// Salida real: Pedro se va y no vuelve
pedro2.ws.close();
await espera(6500);
verifica(
  ana.recibidos.some((m) => m.tipo === "sistema" && m.texto.includes("Pedro salió")),
  "Salida real: Ana ve que Pedro salió",
);
verifica(JSON.stringify(ultU(ana)?.lista) === '["Ana"]', "Lista de usuarios final = [Ana]");
ana.ws.close();
process.exit(fallas ? 1 : 0);
