// Game constants
const SCREEN_WIDTH = 1000;
const SCREEN_HEIGHT = 600;

// Get DOM elements
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const gameUI = document.getElementById('game-ui');
const connectionStatus = document.getElementById('connection-status');

// Game state
let gameState = 'connecting';
let playerId = null;
let players = {};
let levelData = null;
let rankingData = null;
let waitingInfo = null;
let keysPressed = {};

// Connect to WebSocket server
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsHost = `${protocol}//${window.location.host}`;
let socket;

function connectToServer() {
    socket = new WebSocket(wsHost);
    
    socket.onopen = () => {
        console.log('Connected to server');
        connectionStatus.textContent = 'Connected to server';
        connectionStatus.classList.remove('connecting');
    };
    
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleServerMessage(data);
    };
    
    socket.onclose = () => {
        console.log('Disconnected from server');
        gameState = 'disconnected';
        connectionStatus.textContent = 'Disconnected from server';
        connectionStatus.classList.add('connecting');
        
        // Try to reconnect after a delay
        setTimeout(connectToServer, 3000);
    };
    
    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

// Handle messages from the server
function handleServerMessage(data) {
    console.log('Received message:', data.type);
    
    switch (data.type) {
        case 'connection_success':
            playerId = data.playerId;
            console.log('Connected as player', playerId);
            break;
            
        case 'waiting_for_players':
            gameState = 'waiting';
            waitingInfo = data;
            updateWaitingUI();
            break;
            
        case 'game_start':
            gameState = 'playing';
            levelData = data.levelData;
            console.log('Game starting!');
            updateGameUI();
            break;
            
        case 'game_update':
            // Update player positions
            data.players.forEach(player => {
                players[player.id] = player;
            });
            break;
            
        case 'game_end':
            gameState = 'game_over';
            rankingData = data.rankings;
            console.log('Game over, rankings:', rankingData);
            updateGameOverUI();
            break;
    }
}

// Update UI for waiting state
function updateWaitingUI() {
    gameUI.innerHTML = `
        <div id="game-title">Realm Runners</div>
        <div class="status">
            Waiting for players: ${waitingInfo.current}/${waitingInfo.required}
        </div>
        <div id="instructions">
            Use ← → arrows or A/D to move. <br>
            Press SPACE or ↑ to jump.
        </div>
    `;
}

// Update UI for playing state
function updateGameUI() {
    gameUI.innerHTML = `
        <div id="game-title">Realm Runners</div>
        <div id="instructions">
            Use ← → arrows or A/D to move. <br>
            Press SPACE or ↑ to jump.
        </div>
    `;
}

// Update UI for game over state
function updateGameOverUI() {
    let rankingsHTML = '';
    
    rankingData.forEach(rank => {
        const isYou = rank.playerId === playerId;
        const playerClass = isYou ? 'you' : '';
        const playerName = isYou ? 'YOU' : `Player ${rank.playerId.slice(-3)}`;
        const time = rank.time !== null ? `${rank.time.toFixed(2)}s` : 'DNF';
        
        rankingsHTML += `
            <div class="rank-item">
                <span class="${playerClass}">${rank.rank}. ${playerName}</span>
                <span>${time}</span>
            </div>
        `;
    });
    
    gameUI.innerHTML = `
        <div id="game-title">Realm Runners</div>
        <div id="rankings">
            <h2>Final Rankings</h2>
            ${rankingsHTML}
            <p>Next game starting soon...</p>
        </div>
    `;
}

// Update UI for disconnected state
function updateDisconnectedUI() {
    gameUI.innerHTML = `
        <div id="game-title">Realm Runners</div>
        <div class="status connecting">
            Disconnected from server<br>
            Attempting to reconnect...
        </div>
    `;
}

// Draw game elements
function drawGame() {
    // Clear canvas
    ctx.fillStyle = '#87CEEB';  // Sky blue background
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    
    if (levelData) {
        // Draw platforms
        ctx.fillStyle = '#555';
        levelData.platforms.forEach(platform => {
            ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
        });
        
        // Draw hazards
        ctx.fillStyle = '#F55';
        levelData.hazards.forEach(hazard => {
            ctx.fillRect(hazard.x, hazard.y, hazard.width, hazard.height);
        });
        
        // Draw finish line
        ctx.fillStyle = '#5F5';
        const finish = levelData.finishLine;
        ctx.fillRect(finish.x, finish.y, finish.width, finish.height);
    }
    
    // Draw players
    Object.values(players).forEach(player => {
        // Player body
        ctx.fillStyle = player.color;
        ctx.fillRect(player.x, player.y, 40, 40);
        
        // Highlight for current player
        if (player.id === playerId) {
            ctx.strokeStyle = '#FFF';
            ctx.lineWidth = 2;
            ctx.strokeRect(player.x, player.y, 40, 40);
        }
        
        // Player label
        ctx.fillStyle = '#FFF';
        ctx.font = '12px Arial';
        const labelText = player.id === playerId ? 'YOU' : `P${player.id.slice(-3)}`;
        ctx.fillText(labelText, player.x, player.y - 5);
        
        // Show "FINISHED!" for players who have finished
        if (player.isFinished) {
            ctx.fillStyle = '#5F5';
            ctx.font = '16px Arial';
            ctx.fillText('FINISHED!', player.x - 10, player.y - 20);
        }
    });
}

// Draw waiting screen
function drawWaiting() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    
    // Draw fancy background
    for (let i = 0; i < 50; i++) {
        const x = Math.random() * SCREEN_WIDTH;
        const y = Math.random() * SCREEN_HEIGHT;
        const radius = Math.random() * 3 + 1;
        const alpha = Math.random() * 0.5 + 0.1;
        
        ctx.fillStyle = `rgba(100, 100, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Draw disconnected screen
function drawDisconnected() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    
    // Draw red disconnection symbol
    ctx.strokeStyle = '#F55';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - 50, 50, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - 110);
    ctx.lineTo(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - 90);
    ctx.stroke();
}

// Main game loop
function gameLoop() {
    // Handle input if game is playing
    if (gameState === 'playing') {
        handleInput();
    }
    
    // Draw based on game state
    switch (gameState) {
        case 'connecting':
            drawWaiting();
            break;
            
        case 'waiting':
            drawWaiting();
            break;
            
        case 'playing':
            drawGame();
            break;
            
        case 'game_over':
            drawGame();
            break;
            
        case 'disconnected':
            drawDisconnected();
            updateDisconnectedUI();
            break;
    }
    
    // Continue the game loop
    requestAnimationFrame(gameLoop);
}

// Handle keyboard input
function handleInput() {
    let input = null;
    
    if (keysPressed['ArrowLeft'] || keysPressed['a'] || keysPressed['A']) {
        input = 'left';
    } else if (keysPressed['ArrowRight'] || keysPressed['d'] || keysPressed['D']) {
        input = 'right';
    } else {
        input = 'stop_horizontal';
    }
    
    if (input) {
        sendInput(input);
    }
    
    if (keysPressed['ArrowUp'] || keysPressed[' '] || keysPressed['w'] || keysPressed['W']) {
        sendInput('jump');
        // Remove the key from pressed keys to prevent continuous jumping
        delete keysPressed['ArrowUp'];
        delete keysPressed[' '];
        delete keysPressed['w'];
        delete keysPressed['W'];
    }
}

// Send input to server
function sendInput(input) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'player_input',
            input: input
        }));
    }
}

// Set up keyboard event listeners
window.addEventListener('keydown', (e) => {
    keysPressed[e.key] = true;
});

window.addEventListener('keyup', (e) => {
    delete keysPressed[e.key];
});

// Connect to server and start game
connectToServer();
gameLoop();
