// game-server.js
const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');

// Create express app and serve static files
const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// Create HTTP server
const server = http.createServer(app);

// Game constants
const MAX_PLAYERS = 5;
const TICK_RATE = 60;
const TICK_INTERVAL = 1000 / TICK_RATE;

// Game state
let players = {};
let waitingPlayers = [];
let activeGames = [];
let nextGameId = 1;

// Level data
const levelData = {
  platforms: [
    {x: 0, y: 500, width: 800, height: 50},  // Ground
    {x: 200, y: 400, width: 100, height: 20},
    {x: 400, y: 350, width: 100, height: 20},
    {x: 600, y: 300, width: 100, height: 20},
    {x: 800, y: 250, width: 100, height: 20},
  ],
  hazards: [
    {x: 300, y: 480, width: 100, height: 20},  // Spike pit
    {x: 500, y: 480, width: 100, height: 20},
  ],
  finishLine: {x: 900, y: 0, width: 50, height: 500}
};

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Handle new WebSocket connections
wss.on('connection', (ws) => {
  // Create player ID and initial state
  const playerId = generatePlayerId();
  players[playerId] = {
    id: playerId,
    x: 100,
    y: 100,
    vx: 0,
    vy: 0,
    isJumping: false,
    isFinished: false,
    finishTime: null,
    color: getRandomColor(),
    ws: ws
  };
  
  console.log(`Player ${playerId} connected`);
  
  // Send confirmation to player
  sendToPlayer(playerId, {
    type: 'connection_success',
    playerId: playerId
  });
  
  // Add to waiting queue
  waitingPlayers.push(players[playerId]);
  
  // Send waiting info
  broadcastWaitingInfo();
  
  // Handle messages from client
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'player_input') {
        // Handle player input
        if (players[playerId]) {
          const player = players[playerId];
          
          if (data.input === 'left') {
            player.vx = -5;
          } else if (data.input === 'right') {
            player.vx = 5;
          } else if (data.input === 'jump' && !player.isJumping) {
            player.vy = -10;
            player.isJumping = true;
          } else if (data.input === 'stop_horizontal') {
            player.vx = 0;
          }
        }
      }
    } catch (e) {
      console.error("Error processing message:", e);
    }
  });
  
  // Handle disconnections
  ws.on('close', () => {
    console.log(`Player ${playerId} disconnected`);
    
    // Remove from all lists
    if (players[playerId]) {
      // Remove from waiting players
      waitingPlayers = waitingPlayers.filter(p => p.id !== playerId);
      
      // Remove from active games
      for (let game of activeGames) {
        game.players = game.players.filter(p => p.id !== playerId);
        
        // End game if too few players
        if (game.players.length < 2) {
          game.shouldEnd = true;
        }
      }
      
      // Clean up
      delete players[playerId];
      
      // Update waiting info
      broadcastWaitingInfo();
    }
  });
});

// Generate a unique player ID
function generatePlayerId() {
  return 'player_' + Math.random().toString(36).substr(2, 9);
}

// Get a random color for player
function getRandomColor() {
  const r = Math.floor(Math.random() * 155) + 50;
  const g = Math.floor(Math.random() * 155) + 50;
  const b = Math.floor(Math.random() * 155) + 50;
  return `rgb(${r},${g},${b})`;
}

// Send data to specific player
function sendToPlayer(playerId, data) {
  if (players[playerId] && players[playerId].ws) {
    players[playerId].ws.send(JSON.stringify(data));
  }
}

// Send data to all players in a game
function sendToGame(gameId, data) {
  const game = activeGames.find(g => g.id === gameId);
  if (game) {
    for (let player of game.players) {
      sendToPlayer(player.id, data);
    }
  }
}

// Broadcast waiting info to all waiting players
function broadcastWaitingInfo() {
  const waitingInfo = {
    type: 'waiting_for_players',
    current: waitingPlayers.length,
    required: MAX_PLAYERS
  };
  
  for (let player of waitingPlayers) {
    sendToPlayer(player.id, waitingInfo);
  }
  
  // Check if we have enough players to start a game
  checkForGameStart();
}

// Check if we can start a new game
function checkForGameStart() {
  if (waitingPlayers.length >= MAX_PLAYERS) {
    // Get players for the new game
    const gamePlayers = waitingPlayers.splice(0, MAX_PLAYERS);
    startNewGame(gamePlayers);
  }
}

// Start a new game with the given players
function startNewGame(gamePlayers) {
  const gameId = nextGameId++;
  
  console.log(`Starting new game ${gameId} with ${gamePlayers.length} players`);
  
  // Setup initial positions
  for (let i = 0; i < gamePlayers.length; i++) {
    const player = gamePlayers[i];
    player.x = 50;  // All start at left side
    player.y = 400 - (i * 50);  // Staggered vertically
    player.isFinished = false;
    player.finishTime = null;
    player.vx = 0;
    player.vy = 0;
  }
  
  // Create game object
  const game = {
    id: gameId,
    players: gamePlayers,
    startTime: Date.now(),
    isRunning: true,
    shouldEnd: false
  };
  
  // Add to active games
  activeGames.push(game);
  
  // Notify all players that game is starting
  const gameStartData = {
    type: 'game_start',
    gameId: gameId,
    playerIds: gamePlayers.map(p => p.id),
    levelData: levelData
  };
  
  for (let player of gamePlayers) {
    sendToPlayer(player.id, gameStartData);
  }
  
  // Start game loop
  runGameLoop(gameId);
}

// Game loop for a specific game
function runGameLoop(gameId) {
  const game = activeGames.find(g => g.id === gameId);
  if (!game || !game.isRunning) return;
  
  // Update physics
  updateGamePhysics(game);
  
  // Check if game should end
  if (game.shouldEnd || game.players.every(p => p.isFinished)) {
    endGame(gameId);
    return;
  }
  
  // Send game state update
  const gameStateData = {
    type: 'game_update',
    players: game.players.map(p => ({
      id: p.id,
      x: p.x,
      y: p.y,
      color: p.color,
      isFinished: p.isFinished,
      finishTime: p.finishTime
    }))
  };
  
  sendToGame(gameId, gameStateData);
  
  // Schedule next update
  setTimeout(() => runGameLoop(gameId), TICK_INTERVAL);
}

// Update physics for all players in a game
function updateGamePhysics(game) {
  for (let player of game.players) {
    if (player.isFinished) continue;
    
    // Apply gravity
    player.vy += 0.5;
    
    // Update position
    player.x += player.vx;
    player.y += player.vy;
    
    // Platform collision
    for (let platform of levelData.platforms) {
      if (player.x + 20 > platform.x &&
          player.x < platform.x + platform.width &&
          player.y + 40 > platform.y &&
          player.y + 40 < platform.y + 10) {
        player.y = platform.y - 40;
        player.vy = 0;
        player.isJumping = false;
      }
    }
    
    // Hazard collision
    for (let hazard of levelData.hazards) {
      if (player.x + 20 > hazard.x &&
          player.x < hazard.x + hazard.width &&
          player.y + 40 > hazard.y &&
          player.y < hazard.y + hazard.height) {
        // Reset player to start
        player.x = 50;
        player.y = 400;
        player.vx = 0;
        player.vy = 0;
      }
    }
    
    // Finish line detection
    const finish = levelData.finishLine;
    if (player.x + 20 > finish.x &&
        player.x < finish.x + finish.width) {
      if (!player.isFinished) {
        player.isFinished = true;
        player.finishTime = Date.now() - game.startTime;
      }
    }
  }
}

// End a game and send results
function endGame(gameId) {
  const game = activeGames.find(g => g.id === gameId);
  if (!game) return;
  
  console.log(`Ending game ${gameId}`);
  
  // Mark game as not running
  game.isRunning = false;
  
  // Calculate rankings
  const rankings = game.players
    .filter(p => p.isFinished)
    .sort((a, b) => a.finishTime - b.finishTime)
    .map((p, i) => ({
      rank: i + 1,
      playerId: p.id,
      time: p.finishTime / 1000
    }));
  
  // Add unfinished players at the end
  const unfinishedPlayers = game.players
    .filter(p => !p.isFinished)
    .map(p => ({
      rank: rankings.length + 1,
      playerId: p.id,
      time: null
    }));
  
  const fullRankings = [...rankings, ...unfinishedPlayers];
  
  // Send results to all players
  const resultData = {
    type: 'game_end',
    rankings: fullRankings
  };
  
  sendToGame(gameId, resultData);
  
  // Remove game from active games
  activeGames = activeGames.filter(g => g.id !== gameId);
  
  // Put players back in waiting queue
  for (let player of game.players) {
    if (players[player.id]) {  // Make sure player hasn't disconnected
      waitingPlayers.push(player);
    }
  }
  
  // Check if we can start another game
  broadcastWaitingInfo();
}

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
