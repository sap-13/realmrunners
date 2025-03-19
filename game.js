// Game constants
const SCREEN_WIDTH = 1000;
const SCREEN_HEIGHT = 600;

// Get DOM elements
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const gameUI = document.getElementById('game-ui');
const connectionStatus = document.getElementById('connection-status');

// Game state
let gameState = 'waiting'; // Start in waiting state instead of connecting
let playerId = 'player_local';
let players = {};
let levelData = null;
let rankingData = null;
let waitingInfo = {current: 1, required: 5, countdown: 5};
let keysPressed = {};
let localGameLoop = null;
let gameStartTime = null;
let finishTimes = {};

// Initialize the player
players[playerId] = {
    id: playerId,
    x: 100,
    y: 100,
    vx: 0,
    vy: 0,
    isJumping: false,
    isFinished: false,
    finishTime: null,
    color: '#5F9EA0', // You're always teal in solo mode
};

// Add AI players
const aiPlayers = ['ai_player1', 'ai_player2', 'ai_player3', 'ai_player4'];
const aiColors = ['#FF6347', '#FFD700', '#7CFC00', '#9370DB'];

aiPlayers.forEach((id, index) => {
    players[id] = {
        id: id,
        x: 50,
        y: 100 + (index * 50),
        vx: 0,
        vy: 0,
        isJumping: false,
        isFinished: false,
        finishTime: null,
        color: aiColors[index],
        aiLevel: Math.random() * 0.5 + 0.5, // Random skill level between 0.5 and 1.0
    };
});

// Level data
levelData = {
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

// Update waiting UI
function updateWaitingUI() {
    gameUI.innerHTML = `
        <div id="game-title">Realm Runners</div>
        <div class="status">
            Solo Mode - Starting in ${waitingInfo.countdown}...
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
        const playerName = isYou ? 'YOU' : `AI ${rank.playerId.slice(-1)}`;
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
            <button id="play-again" style="padding: 10px 20px; margin-top: 20px; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer;">Play Again</button>
        </div>
    `;
    
    // Add click event to play again button
    document.getElementById('play-again').addEventListener('click', () => {
        resetGame();
    });
}

// Reset the game for a new round
function resetGame() {
    // Reset player positions
    players[playerId].x = 100;
    players[playerId].y = 100;
    players[playerId].vx = 0;
    players[playerId].vy = 0;
    players[playerId].isJumping = false;
    players[playerId].isFinished = false;
    players[playerId].finishTime = null;
    
    aiPlayers.forEach((id, index) => {
        players[id].x = 50;
        players[id].y = 100 + (index * 50);
        players[id].vx = 0;
        players[id].vy = 0;
        players[id].isJumping = false;
        players[id].isFinished = false;
        players[id].finishTime = null;
        players[id].aiLevel = Math.random() * 0.5 + 0.5; // Randomize skill level again
    });
    
    // Reset game state
    gameState = 'waiting';
    waitingInfo = {current: 1, required: 5, countdown: 5};
    finishTimes = {};
    
    // Start countdown
    connectionStatus.textContent = 'Local Mode Active';
    connectionStatus.classList.remove('connecting');
    startCountdown();
}

// Handle countdown before game start
function startCountdown() {
    updateWaitingUI();
    
    const countdownInterval = setInterval(() => {
        waitingInfo.countdown--;
        updateWaitingUI();
        
        if (waitingInfo.countdown <= 0) {
            clearInterval(countdownInterval);
            startGame();
        }
    }, 1000);
}

// Start the game
function startGame() {
    gameState = 'playing';
    gameStartTime = Date.now();
    updateGameUI();
    
    // Start the game loop if not already running
    if (!localGameLoop) {
        localGameLoop = setInterval(updateGamePhysics, 1000 / 60); // 60 FPS
    }
}

// AI logic for computer players
function updateAI() {
    aiPlayers.forEach(id => {
        const player = players[id];
        if (player.isFinished) return;
        
        // Random chance to jump when near a gap
        const isNearHazard = levelData.hazards.some(hazard => 
            Math.abs(player.x - hazard.x) < 100 && player.x < hazard.x
        );
        
        // Random chance to jump based on AI level
        if (isNearHazard && !player.isJumping && Math.random() < player.aiLevel) {
            player.vy = -10;
            player.isJumping = true;
        }
        
        // Always move right (towards finish) with random variations in speed
        player.vx = 3 + (Math.random() * 2 * player.aiLevel);
    });
}

// Update physics for all players
function updateGamePhysics() {
    // Update AI movement
    updateAI();
    
    // Process physics for all players
    Object.values(players).forEach(player => {
        if (player.isFinished) return;
        
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
                // Reset player to a bit back from where they fell
                player.x = Math.max(50, player.x - 100);
                player.y = 400;
                player.vx = 0;
                player.vy = 0;
            }
        }
        
        // Boundaries
        if (player.x < 0) player.x = 0;
        if (player.y < 0) player.y = 0;
        if (player.y > SCREEN_HEIGHT) {
            player.y = 400;
            player.vy = 0;
        }
        
        // Finish line detection
        const finish = levelData.finishLine;
        if (player.x + 20 > finish.x &&
            player.x < finish.x + finish.width) {
            if (!player.isFinished) {
                player.isFinished = true;
                player.finishTime = Date.now() - gameStartTime;
                finishTimes[player.id] = player.finishTime;
                
                // Check if all players finished
                checkForGameEnd();
            }
        }
    });
}

// Check if the game should end
function checkForGameEnd() {
    const allPlayersFinished = Object.values(players).every(p => p.isFinished);
    const timePassed = Date.now() - gameStartTime > 30000; // 30 second time limit
    
    if (allPlayersFinished || timePassed) {
        endGame();
    }
}

// End the game and show results
function endGame() {
    gameState = 'game_over';
    
    if (localGameLoop) {
        clearInterval(localGameLoop);
        localGameLoop = null;
    }
    
    // Calculate rankings
    const finishedPlayers = Object.values(players).filter(p => p.isFinished)
        .sort((a, b) => a.finishTime - b.finishTime);
    
    const unfinishedPlayers = Object.values(players).filter(p => !p.isFinished);
    
    rankingData = finishedPlayers.map((p, i) => ({
        rank: i + 1,
        playerId: p.id,
        time: p.finishTime / 1000
    }));
    
    // Add unfinished players
    unfinishedPlayers.forEach(p => {
        rankingData.push({
            rank: rankingData.length + 1,
            playerId: p.id,
            time: null
        });
    });
    
    updateGameOverUI();
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
        const labelText = player.id === playerId ? 'YOU' : `AI ${player.id.slice(-1)}`;
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

// Main game loop
function gameLoop() {
    // Handle input if game is playing
    if (gameState === 'playing') {
        handleInput();
    }
    
    // Draw based on game state
    switch (gameState) {
        case 'waiting':
            drawWaiting();
            break;
            
        case 'playing':
            drawGame();
            break;
            
        case 'game_over':
            drawGame();
            break;
    }
    
    // Continue the game loop
    requestAnimationFrame(gameLoop);
}

// Handle keyboard input
function handleInput() {
    const player = players[playerId];
    
    if (keysPressed['ArrowLeft'] || keysPressed['a'] || keysPressed['A']) {
        player.vx = -5;
    } else if (keysPressed['ArrowRight'] || keysPressed['d'] || keysPressed['D']) {
        player.vx = 5;
    } else {
        player.vx = 0;
    }
    
    if ((keysPressed['ArrowUp'] || keysPressed[' '] || keysPressed['w'] || keysPressed['W']) && !player.isJumping) {
        player.vy = -10;
        player.isJumping = true;
        
        // Remove the key from pressed keys to prevent continuous jumping
        delete keysPressed['ArrowUp'];
        delete keysPressed[' '];
        delete keysPressed['w'];
        delete keysPressed['W'];
    }
}

// Set up keyboard event listeners
window.addEventListener('keydown', (e) => {
    keysPressed[e.key] = true;
});

window.addEventListener('keyup', (e) => {
    delete keysPressed[e.key];
});

// Initialize 
connectionStatus.textContent = 'Local Mode Active';
connectionStatus.classList.remove('connecting');
startCountdown();
gameLoop();
