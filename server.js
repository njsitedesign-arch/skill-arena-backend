const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

let players = [];

wss.on("connection", (ws) => {
  if (players.length >= 2) {
    ws.close();
    return;
  }

  const player = {
    id: players.length,
    x: players.length === 0 ? 50 : 350,
    y: 200,
    dx: 1,
    dy: 0,
    alive: true,
    ws
  };

  players.push(player);

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

function gameLoop() {
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

  players.forEach(p => {
    p.ws.send(JSON.stringify(state));
  });
}

setInterval(gameLoop, 50);

console.log("WebSocket server running on", PORT);
