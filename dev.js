// Solo para probar en tu computador:  npm run dev   (puerto 8000, o PORT)
import server from "./api/ws.js";
const puerto = Number(process.env.PORT ?? 8000);
server.listen(puerto, () => console.log(`Chat en ws://localhost:${puerto}`));
