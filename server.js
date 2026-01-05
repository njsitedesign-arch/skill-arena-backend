const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 3000;

// Game Constants
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const PLAYER_SIZE = 6;
const PLAYER_SPEED = 3.5;
const TICK_RATE = 50; // 20 ticks per second
const LOBBY_CODE_LENGTH = 5;
const MAX_LOBBIES = 100;

// Game state
const lobbies = new Map();
const players = new Map();

// Generate random lobby code
function generateLobbyCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < LOBBY_CODE_LENGTH; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Create arena
function createArena() {
  return {
    x: 50,
    y: 50,
    width: CANVAS_WIDTH - 100,
    height: CANVAS_HEIGHT - 100,
    shrinkActive: false,
    shrinkStartTime: 20,
    shrinkSpeed: 0.2,
    startTime: Date.now()
  };
}

// Create player
function createPlayer(lobbyId, playerId, isPlayerOne) {
  const arena = lobbies.get(lobbyId).arena;
  return {
    id: playerId,
    x: isPlayerOne ? arena.x + 100 : arena.x + arena.width - 100,
    y: arena.y + arena.height / 2,
    dx: isPlayerOne ? PLAYER_SPEED : -PLAYER_SPEED,
    dy: 0,
    color: isPlayerOne ? '#9d4edd' : '#00bbff',
    trail: [],
    alive: true,
    keys: { up: false, left: false, down: false, right: false },
    lastInputTime: Date.now(),
    score: 0
  };
}

// Check collision
function checkCollision(player, lobby) {
  const arena = lobby.arena;
  
  // Wall collision
  if (player.x < arena.x || player.x >= arena.x + arena.width ||
      player.y < arena.y || player.y >= arena.y + arena.height) {
    return 'wall';
  }
  
  // Own trail collision
  for (let i = 0; i < player.trail.length - 10; i++) {
    const point = player.trail[i];
    if (Math.abs(point.x - player.x) < PLAYER_SIZE && 
        Math.abs(point.y - player.y) < PLAYER_SIZE) {
      return 'own_trail';
    }
  }
  
  // Opponent trail collision
  const opponent = lobby.players.find(p => p.id !== player.id && p.alive);
  if (opponent) {
    for (let i = 0; i < opponent.trail.length; i++) {
      const point = opponent.trail[i];
      if (Math.abs(point.x - player.x) < PLAYER_SIZE && 
          Math.abs(point.y - player.y) < PLAYER_SIZE) {
        return 'opponent_trail';
      }
    }
  }
  
  return null;
}

// Update player position
function updatePlayer(player, arena) {
  if (!player.alive) return;
  
  // Update position based on input
  if (player.keys.up && !player.keys.down) { player.dx = 0; player.dy = -PLAYER_SPEED; }
  if (player.keys.down && !player.keys.up) { player.dx = 0; player.dy = PLAYER_SPEED; }
  if (player.keys.left && !player.keys.right) { player.dx = -PLAYER_SPEED; player.dy = 0; }
  if (player.keys.right && !player.keys.left) { player.dx = PLAYER_SPEED; player.dy = 0; }
  
  // Add trail point
  player.trail.push({ x: Math.floor(player.x), y: Math.floor(player.y) });
  
  // Update position
  player.x += player.dx;
  player.y += player.dy;
}

// Calculate territory
function calculateTerritory(lobby) {
  const alivePlayers = lobby.players.filter(p => p.alive);
  if (alivePlayers.length === 0) return {};
  
  // Simple territory calculation based on trail length
  const totalCells = lobby.arena.width * lobby.arena.height / 16;
  const scores = {};
  
  alivePlayers.forEach(player => {
    player.score = player.trail.length * 8;
    scores[player.id] = player.score;
  });
  
  return scores;
}

// Main game loop
function gameLoop(lobbyId) {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;
  
  const now = Date.now();
  const elapsed = (now - lobby.startTime) / 1000;
  const timeLeft = Math.max(0, 60 - elapsed);
  
  // Update arena shrink
  if (!lobby.arena.shrinkActive && elapsed >= lobby.arena.shrinkStartTime) {
    lobby.arena.shrinkActive = true;
  }
  
  if (lobby.arena.shrinkActive) {
    lobby.arena.x += lobby.arena.shrinkSpeed;
    lobby.arena.y += lobby.arena.shrinkSpeed;
    lobby.arena.width -= lobby.arena.shrinkSpeed * 2;
    lobby.arena.height -= lobby.arena.shrinkSpeed * 2;
  }
  
  // Update players
  lobby.players.forEach(player => {
    updatePlayer(player, lobby.arena);
    const collision = checkCollision(player, lobby);
    if (collision) {
      player.alive = false;
      lobby.events.push({
        type: 'elimination',
        playerId: player.id,
        reason: collision,
        time: now
      });
    }
  });
  
  // Check game end
  const alivePlayers = lobby.players.filter(p => p.alive);
  if (alivePlayers.length === 1) {
    lobby.winner = alivePlayers[0].id;
    lobby.gameOver = true;
    lobby.events.push({
      type: 'victory',
      playerId: lobby.winner,
      time: now
    });
  } else if (alivePlayers.length === 0) {
    lobby.gameOver = true;
    lobby.events.push({
      type: 'draw',
      time: now
    });
  } else if (timeLeft <= 0) {
    const scores = calculateTerritory(lobby);
    const playersArray = lobby.players.map(p => ({ id: p.id, score: p.score }));
    playersArray.sort((a, b) => b.score - a.score);
    lobby.winner = playersArray[0].score > playersArray[1]?.score ? playersArray[0].id : null;
    lobby.gameOver = true;
    lobby.events.push({
      type: 'time_up',
      winner: lobby.winner,
      scores: scores,
      time: now
    });
  }
  
  // Prepare game state
  const gameState = {
    type: 'game_state',
    arena: { ...lobby.arena },
    players: lobby.players.map(p => ({
      id: p.id,
      x: p.x,
      y: p.y,
      dx: p.dx,
      dy: p.dy,
      color: p.color,
      trail: p.trail.slice(-1000), // Send only recent trail
      alive: p.alive,
      score: p.score
    })),
    timeLeft: Math.floor(timeLeft),
    events: [...lobby.events],
    gameOver: lobby.gameOver,
    winner: lobby.winner
  };
  
  // Clear events
  lobby.events.length = 0;
  
  // Broadcast to all players in lobby
  lobby.players.forEach(player => {
    const ws = players.get(player.id);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(gameState));
    }
  });
  
  // Cleanup if game over
  if (lobby.gameOver) {
    setTimeout(() => {
      if (lobbies.has(lobbyId)) {
        lobbies.delete(lobbyId);
      }
    }, 10000); // Cleanup after 10 seconds
  }
}

// HTTP server for static files
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <html>
      <body>
        <h1>Territory Control Server</h1>
        <p>Server is running. Connect via WebSocket.</p>
      </body>
    </html>
  `);
});

// WebSocket server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  const playerId = generateLobbyCode();
  players.set(playerId, ws);
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'create_lobby':
          if (lobbies.size >= MAX_LOBBIES) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Maximum number of lobbies reached'
            }));
            return;
          }
          
          let lobbyCode;
          do {
            lobbyCode = generateLobbyCode();
          } while (lobbies.has(lobbyCode));
          
          const lobby = {
            id: lobbyCode,
            players: [],
            arena: createArena(),
            gameStarted: false,
            gameOver: false,
            winner: null,
            events: [],
            gameLoop: null
          };
          
          lobbies.set(lobbyCode, lobby);
          
          ws.send(JSON.stringify({
            type: 'lobby_created',
            lobbyId: lobbyCode,
            playerId: playerId
          }));
          break;
          
        case 'join_lobby':
          const lobbyToJoin = lobbies.get(data.lobbyId);
          if (!lobbyToJoin) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Lobby not found'
            }));
            return;
          }
          
          if (lobbyToJoin.players.length >= 2) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Lobby is full'
            }));
            return;
          }
          
          if (lobbyToJoin.gameStarted) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Game already started'
            }));
            return;
          }
          
          const isPlayerOne = lobbyToJoin.players.length === 0;
          const player = createPlayer(data.lobbyId, playerId, isPlayerOne);
          lobbyToJoin.players.push(player);
          
          ws.send(JSON.stringify({
            type: 'joined_lobby',
            lobbyId: data.lobbyId,
            playerId: playerId,
            isPlayerOne: isPlayerOne,
            color: player.color
          }));
          
          // Notify other player
          if (lobbyToJoin.players.length === 1) {
            ws.send(JSON.stringify({
              type: 'waiting_for_opponent'
            }));
          } else {
            // Start game when both players are ready
            lobbyToJoin.gameStarted = true;
            lobbyToJoin.startTime = Date.now();
            lobbyToJoin.gameLoop = setInterval(() => gameLoop(data.lobbyId), TICK_RATE);
            
            // Notify both players
            lobbyToJoin.players.forEach(p => {
              const playerWs = players.get(p.id);
              if (playerWs && playerWs.readyState === WebSocket.OPEN) {
                playerWs.send(JSON.stringify({
                  type: 'game_starting',
                  opponentConnected: true
                }));
              }
            });
          }
          break;
          
        case 'get_lobbies':
          const openLobbies = Array.from(lobbies.values())
            .filter(l => !l.gameStarted && l.players.length < 2)
            .map(l => ({
              id: l.id,
              players: l.players.length,
              maxPlayers: 2
            }));
          
          ws.send(JSON.stringify({
            type: 'lobby_list',
            lobbies: openLobbies
          }));
          break;
          
        case 'player_input':
          const playerLobby = Array.from(lobbies.values()).find(l => 
            l.players.some(p => p.id === playerId)
          );
          
          if (playerLobby && playerLobby.gameStarted) {
            const gamePlayer = playerLobby.players.find(p => p.id === playerId);
            if (gamePlayer && gamePlayer.alive) {
              gamePlayer.keys = data.keys;
              gamePlayer.lastInputTime = Date.now();
            }
          }
          break;
          
        case 'leave_lobby':
          // Find and remove player from lobby
          for (const [lobbyId, lobby] of lobbies) {
            const playerIndex = lobby.players.findIndex(p => p.id === playerId);
            if (playerIndex !== -1) {
              lobby.players.splice(playerIndex, 1);
              
              // Notify remaining player
              if (lobby.players.length > 0) {
                lobby.players.forEach(p => {
                  const playerWs = players.get(p.id);
                  if (playerWs) {
                    playerWs.send(JSON.stringify({
                      type: 'opponent_left'
                    }));
                  }
                });
              }
              
              // Cleanup empty lobby
              if (lobby.players.length === 0) {
                if (lobby.gameLoop) {
                  clearInterval(lobby.gameLoop);
                }
                lobbies.delete(lobbyId);
              }
              
              break;
            }
          }
          break;
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });
  
  ws.on('close', () => {
    players.delete(playerId);
    
    // Remove player from lobby
    for (const [lobbyId, lobby] of lobbies) {
      const playerIndex = lobby.players.findIndex(p => p.id === playerId);
      if (playerIndex !== -1) {
        lobby.players.splice(playerIndex, 1);
        
        // Notify remaining player
        if (lobby.players.length > 0) {
          lobby.players.forEach(p => {
            const playerWs = players.get(p.id);
            if (playerWs) {
              playerWs.send(JSON.stringify({
                type: 'opponent_disconnected'
              }));
            }
          });
        }
        
        // Cleanup empty lobby
        if (lobby.players.length === 0) {
          if (lobby.gameLoop) {
            clearInterval(lobby.gameLoop);
          }
          lobbies.delete(lobbyId);
        }
        
        break;
      }
    }
  });
  
  // Send initial connection info
  ws.send(JSON.stringify({
    type: 'connected',
    playerId: playerId
  }));
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server ready`);
});
