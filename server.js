const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

let players = [];

wss.on("connection", (ws) => {
  if (players.length >= 2) {
    ws.send(JSON.stringify({ type: "full" }));
    ws.close();
    return;
  }

  const id = players.length;
  const player = {
    id,
    x: id === 0 ? 100 : 300,
    y: 200,
    dx: 0,
    dy: 0,
    alive: true,
    ws
  };

  players.push(player);

  ws.send(JSON.stringify({ type: "init", id }));

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);
    if (data.type === "move") {
      player.dx = data.dx;
      player.dy = data.dy;
    }
  });

  ws.on("close", () => {
    players = [];
  });
});

function tick() {
  if (players.length < 2) return;

  players.forEach(p => {
    if (!p.alive) return;
    p.x += p.dx * 2;
    p.y += p.dy * 2;

    if (p.x < 0 || p.x > 400 || p.y < 0 || p.y > 400) {
      p.alive = false;
    }
  });

  const state = {
    type: "state",
    players: players.map(p => ({
      id: p.id,
      x: p.x,
      y: p.y,
      alive: p.alive
    }))
  };

  players.forEach(p => p.ws.send(JSON.stringify(state)));
}

setInterval(tick, 50);
console.log("WebSocket multiplayer server running on", PORT);
