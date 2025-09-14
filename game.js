import { Peer } from 'peerjs';
import QRCode from 'qrcode';

class BoardGame {
    constructor() {
        this.peer = null;
        this.isHost = false;
        this.players = new Map();
        this.currentPlayerIndex = 0;
        this.gameState = {
            players: [],
            currentPlayer: 0,
            board: this.createBoard(),
            gameStarted: false
        };
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkForJoinUrl();
    }

    setupEventListeners() {
        // Menu buttons
        document.getElementById('host-btn').addEventListener('click', () => this.hostGame());
        document.getElementById('join-btn').addEventListener('click', () => this.showJoinScreen());
        document.getElementById('back-to-menu').addEventListener('click', () => this.showMainMenu());
        document.getElementById('back-to-menu-player').addEventListener('click', () => this.showMainMenu());
        document.getElementById('start-game-btn').addEventListener('click', () => this.startGame());
        
        // Dice rolling
        document.getElementById('roll-dice-btn').addEventListener('click', () => this.rollDice());
    }

    checkForJoinUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const peerjsId = urlParams.get('peerjsid');
        
        if (peerjsId) {
            this.joinGame(peerjsId);
        }
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }

    showMainMenu() {
        this.showScreen('main-menu');
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
        this.players.clear();
        this.isHost = false;
    }

    showJoinScreen() {
        this.showScreen('player-setup');
        document.getElementById('connection-status').className = 'status-connecting';
        document.getElementById('connection-status').textContent = 'Enter game ID or scan QR code';
    }

    async hostGame() {
        this.isHost = true;
        this.showScreen('host-setup');
        
        try {
            this.peer = new Peer();
            
            this.peer.on('open', async (id) => {
                console.log('Host peer ID:', id);
                await this.generateQRCode(id);
                this.updatePlayersDisplay();
            });

            this.peer.on('connection', (conn) => {
                this.handlePlayerConnection(conn);
            });

            this.peer.on('error', (error) => {
                console.error('Peer error:', error);
            });

        } catch (error) {
            console.error('Failed to create peer:', error);
        }
    }

    async generateQRCode(peerId) {
        const joinUrl = `https://boardgames.on.websim.com/?peerjsid=${peerId}`;
        document.getElementById('join-url').textContent = joinUrl;
        
        try {
            const canvas = document.getElementById('qr-code');
            await QRCode.toCanvas(canvas, joinUrl, {
                width: 200,
                margin: 2,
                color: {
                    dark: '#2c3e50',
                    light: '#ffffff'
                }
            });
        } catch (error) {
            console.error('Failed to generate QR code:', error);
        }
    }

    async joinGame(hostId) {
        this.showScreen('player-setup');
        document.getElementById('connection-status').className = 'status-connecting';
        document.getElementById('connection-status').textContent = 'Connecting to game...';
        
        try {
            this.peer = new Peer();
            
            this.peer.on('open', (id) => {
                console.log('Player peer ID:', id);
                const conn = this.peer.connect(hostId);
                this.handleHostConnection(conn);
            });

            this.peer.on('error', (error) => {
                console.error('Connection error:', error);
                document.getElementById('connection-status').className = 'status-error';
                document.getElementById('connection-status').textContent = 'Failed to connect to game';
            });

        } catch (error) {
            console.error('Failed to join game:', error);
        }
    }

    handlePlayerConnection(conn) {
        conn.on('open', () => {
            console.log('Player connected:', conn.peer);
        });

        conn.on('data', (data) => {
            this.handlePlayerMessage(conn, data);
        });

        conn.on('close', () => {
            this.players.delete(conn.peer);
            this.updatePlayersDisplay();
            this.broadcastGameState();
        });
    }

    handleHostConnection(conn) {
        conn.on('open', () => {
            console.log('Connected to host');
            document.getElementById('connection-status').className = 'status-connected';
            document.getElementById('connection-status').textContent = 'Connected! Enter your name:';
            
            // Add join button functionality
            const joinBtn = document.getElementById('join-game-btn');
            joinBtn.style.display = 'block';
            joinBtn.addEventListener('click', () => {
                this.sendPlayerInfo(conn);
            });
            
            document.getElementById('player-name').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendPlayerInfo(conn);
                }
            });
        });

        conn.on('data', (data) => {
            this.handleHostMessage(data);
        });

        conn.on('close', () => {
            document.getElementById('connection-status').className = 'status-error';
            document.getElementById('connection-status').textContent = 'Connection lost';
        });
    }

    sendPlayerInfo(conn) {
        const name = document.getElementById('player-name').value.trim();
        if (name) {
            conn.send({
                type: 'player-join',
                name: name,
                color: this.getRandomColor()
            });
            document.getElementById('connection-status').textContent = 'Joining game...';
            document.getElementById('join-game-btn').disabled = true;
        }
    }

    handlePlayerMessage(conn, data) {
        switch (data.type) {
            case 'player-join':
                this.players.set(conn.peer, {
                    name: data.name,
                    color: data.color,
                    connection: conn,
                    position: 0
                });
                
                // Send confirmation back to player
                conn.send({
                    type: 'join-confirmed',
                    playerId: conn.peer
                });
                
                this.updatePlayersDisplay();
                this.broadcastGameState();
                this.addToGameLog(`${data.name} joined the game`);
                break;
                
            case 'dice-roll':
                if (this.gameState.gameStarted) {
                    this.processDiceRoll(conn.peer, data.value);
                }
                break;
                
            case 'chat-message':
                this.broadcastChatMessage(data.message, data.playerName);
                break;
        }
    }

    processDiceRoll(playerId, diceValue) {
        if (!this.isHost) return;

        const playersArray = Array.from(this.players.values());
        const playerIds = Array.from(this.players.keys());
        const currentPlayerId = playerIds[this.currentPlayerIndex];
        
        if (playerId !== currentPlayerId) {
            console.log(`Player with ID ${playerId} tried to roll out of turn.`);
            const player = this.players.get(playerId);
            if(player && player.connection) {
                player.connection.send({type: 'error', message: "Not your turn."});
            }
            return;
        }
        
        const currentPlayer = playersArray[this.currentPlayerIndex];
        
        // Broadcast dice result to all players including host to show animation.
        // We can do this on host side as well.
        this.updateDiceDisplay(diceValue);
        this.players.forEach((p) => {
            if (p.connection) {
                p.connection.send({
                    type: 'dice-result',
                    value: diceValue
                });
            }
        });
        
        this.addToGameLog(`${currentPlayer.name} rolled a ${diceValue}`);
        this.movePlayer(currentPlayer, diceValue);
    }

    handleHostMessage(data) {
        switch (data.type) {
            case 'game-state':
                this.gameState = data.gameState;
                if (data.gameState.gameStarted) {
                    this.showGameBoard();
                }
                this.updateGameDisplay();
                break;
                
            case 'join-confirmed':
                document.getElementById('connection-status').className = 'status-connected';
                document.getElementById('connection-status').textContent = 'Successfully joined! Waiting for game to start...';
                break;
                
            case 'dice-result':
                this.updateDiceDisplay(data.value);
                break;
                
            case 'game-log':
                this.addToGameLog(data.message);
                break;
                
            case 'chat-message':
                this.displayChatMessage(data.message, data.playerName);
                break;
        }
    }

    updatePlayersDisplay() {
        const playersDiv = document.getElementById('players');
        playersDiv.innerHTML = '';
        
        this.players.forEach((player, id) => {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'player-item';
            playerDiv.innerHTML = `
                <div class="player-color" style="background-color: ${player.color}"></div>
                <span>${player.name}</span>
            `;
            playersDiv.appendChild(playerDiv);
        });

        const startBtn = document.getElementById('start-game-btn');
        startBtn.disabled = this.players.size < 1;
    }

    broadcastGameState() {
        const gameState = {
            players: Array.from(this.players.entries()).map(([id, player]) => ({
                id,
                name: player.name,
                color: player.color,
                position: player.position
            })),
            currentPlayer: this.currentPlayerIndex,
            gameStarted: this.gameState.gameStarted
        };

        this.players.forEach((player) => {
            player.connection.send({
                type: 'game-state',
                gameState
            });
        });
    }

    startGame() {
        this.gameState.gameStarted = true;
        this.gameState.players = Array.from(this.players.values());
        this.broadcastGameState();
        this.showGameBoard();
    }

    showGameBoard() {
        this.showScreen('game-board');
        this.renderBoard();
        this.updateGameDisplay();
    }

    createBoard() {
        // Create a board with special spaces
        const spaces = [];
        const boardSize = 12;
        const specialSpaces = [5, 11, 17, 23, 29, 35, 41]; // Special space indices
        
        // Bottom row (left to right)
        for (let i = 0; i < boardSize; i++) {
            spaces.push({ 
                x: i * 60 + 50, 
                y: 700, 
                id: spaces.length,
                type: specialSpaces.includes(spaces.length) ? 'special' : 'normal'
            });
        }
        
        // Right column (bottom to top)
        for (let i = 1; i < boardSize; i++) {
            spaces.push({ 
                x: 710, 
                y: 700 - i * 60, 
                id: spaces.length,
                type: specialSpaces.includes(spaces.length) ? 'special' : 'normal'
            });
        }
        
        // Top row (right to left)
        for (let i = 1; i < boardSize; i++) {
            spaces.push({ 
                x: 710 - i * 60, 
                y: 100, 
                id: spaces.length,
                type: specialSpaces.includes(spaces.length) ? 'special' : 'normal'
            });
        }
        
        // Left column (top to bottom)
        for (let i = 1; i < boardSize - 1; i++) {
            spaces.push({ 
                x: 50, 
                y: 100 + i * 60, 
                id: spaces.length,
                type: specialSpaces.includes(spaces.length) ? 'special' : 'normal'
            });
        }
        
        return spaces;
    }

    renderBoard() {
        const svg = document.getElementById('game-board-svg');
        svg.innerHTML = '';
        
        // Draw spaces
        this.gameState.board.forEach((space, index) => {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', space.x);
            circle.setAttribute('cy', space.y);
            circle.setAttribute('r', 20);
            circle.setAttribute('fill', space.type === 'special' ? '#f39c12' : '#ecf0f1');
            circle.setAttribute('stroke', '#2c3e50');
            circle.setAttribute('stroke-width', 2);
            svg.appendChild(circle);
            
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', space.x);
            text.setAttribute('y', space.y + 5);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('font-family', 'Space Mono');
            text.setAttribute('font-size', '12');
            text.setAttribute('fill', '#2c3e50');
            text.textContent = index;
            svg.appendChild(text);
        });
        
        // Draw player pieces
        this.renderPlayerPieces();
    }

    renderPlayerPieces() {
        const svg = document.getElementById('game-board-svg');
        
        // Remove existing player pieces
        svg.querySelectorAll('.player-piece').forEach(piece => piece.remove());
        
        // Draw current player pieces
        if (this.isHost) {
            this.players.forEach((player, id) => {
                this.drawPlayerPiece(svg, player, player.position);
            });
        } else if (this.gameState.players) {
            this.gameState.players.forEach(player => {
                this.drawPlayerPiece(svg, player, player.position);
            });
        }
    }

    drawPlayerPiece(svg, player, position) {
        const space = this.gameState.board[position];
        if (!space) return;
        
        const piece = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        piece.setAttribute('cx', space.x);
        piece.setAttribute('cy', space.y - 30);
        piece.setAttribute('r', 8);
        piece.setAttribute('fill', player.color);
        piece.setAttribute('stroke', '#ffffff');
        piece.setAttribute('stroke-width', 2);
        piece.classList.add('player-piece');
        svg.appendChild(piece);
    }

    updateDiceDisplay(value) {
        const diceDisplay = document.getElementById('dice-display');
        if (diceDisplay) {
            diceDisplay.textContent = value;
            
            // Add animation effect
            diceDisplay.style.transform = 'scale(1.3)';
            setTimeout(() => {
                diceDisplay.style.transform = 'scale(1)';
            }, 200);
        }
    }

    rollDice() {
        const value = Math.floor(Math.random() * 6) + 1;
        this.updateDiceDisplay(value);
        this.playDiceSound();
        
        if (this.isHost) {
            const currentPlayer = Array.from(this.players.values())[this.currentPlayerIndex];
            if (currentPlayer) {
                this.movePlayer(currentPlayer, value);
                this.addToGameLog(`${currentPlayer.name} rolled a ${value}`);
            }
        } else {
            // Send dice roll to host
            const connections = this.peer.connections;
            const hostConnection = Object.values(connections)[0][0];
            if (hostConnection) {
                hostConnection.send({
                    type: 'dice-roll',
                    playerId: this.peer.id,
                    value: value
                });
            }
        }
    }

    playDiceSound() {
        // Simple dice sound effect using Web Audio API
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
    }

    movePlayer(player, spaces) {
        const oldPosition = player.position;
        player.position = (player.position + spaces) % this.gameState.board.length;
        
        // Check for special space effects
        const currentSpace = this.gameState.board[player.position];
        if (currentSpace.type === 'special') {
            this.handleSpecialSpace(player);
        }
        
        this.renderPlayerPieces();
        this.nextTurn();
        this.broadcastGameState();
        
        this.addToGameLog(`${player.name} moved from space ${oldPosition} to space ${player.position}`);
    }

    handleSpecialSpace(player) {
        const effects = [
            { text: 'Move forward 3 spaces!', action: () => { player.position = (player.position + 3) % this.gameState.board.length; }},
            { text: 'Move back 2 spaces!', action: () => { player.position = Math.max(0, player.position - 2); }},
            { text: 'Skip next turn!', action: () => { /* Could implement turn skipping */ }},
            { text: 'Roll again!', action: () => { this.currentPlayerIndex = (this.currentPlayerIndex - 1 + this.players.size) % this.players.size; }}
        ];
        
        const effect = effects[Math.floor(Math.random() * effects.length)];
        effect.action();
        this.addToGameLog(`${player.name} landed on a special space: ${effect.text}`);
    }

    addToGameLog(message) {
        const gameLog = document.getElementById('game-log');
        if (gameLog) {
            const logEntry = document.createElement('div');
            logEntry.className = 'log-entry';
            logEntry.textContent = `${new Date().toLocaleTimeString()}: ${message}`;
            gameLog.appendChild(logEntry);
            gameLog.scrollTop = gameLog.scrollHeight;
        }
        
        // Broadcast to all players if host
        if (this.isHost) {
            this.players.forEach((player) => {
                player.connection.send({
                    type: 'game-log',
                    message: message
                });
            });
        }
    }

    broadcastChatMessage(message, playerName) {
        this.displayChatMessage(message, playerName);
        
        if (this.isHost) {
            this.players.forEach((player) => {
                player.connection.send({
                    type: 'chat-message',
                    message: message,
                    playerName: playerName
                });
            });
        }
    }

    displayChatMessage(message, playerName) {
        const gameLog = document.getElementById('game-log');
        if (gameLog) {
            const chatEntry = document.createElement('div');
            chatEntry.className = 'chat-entry';
            chatEntry.innerHTML = `<strong>${playerName}:</strong> ${message}`;
            gameLog.appendChild(chatEntry);
            gameLog.scrollTop = gameLog.scrollHeight;
        }
    }

    nextTurn() {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.size;
        this.updateGameDisplay();
    }

    updateGameDisplay() {
        const currentPlayerSpan = document.getElementById('current-player-name');
        if (this.isHost) {
            const players = Array.from(this.players.values());
            if (players[this.currentPlayerIndex]) {
                currentPlayerSpan.textContent = players[this.currentPlayerIndex].name;
            }
        } else if (this.gameState.players) {
            if (this.gameState.players[this.gameState.currentPlayer]) {
                currentPlayerSpan.textContent = this.gameState.players[this.gameState.currentPlayer].name;
            }
        }
        
        this.updateGamePlayersList();
    }

    updateGamePlayersList() {
        const playersListDiv = document.getElementById('game-players-list');
        playersListDiv.innerHTML = '';
        
        const players = this.isHost ? Array.from(this.players.values()) : this.gameState.players;
        const currentIndex = this.isHost ? this.currentPlayerIndex : this.gameState.currentPlayer;
        
        if (players) {
            players.forEach((player, index) => {
                const playerDiv = document.createElement('div');
                playerDiv.className = 'game-player-item';
                if (index === currentIndex) {
                    playerDiv.classList.add('current');
                }
                playerDiv.innerHTML = `
                    <div class="player-color" style="background-color: ${player.color}"></div>
                    <span>${player.name}</span>
                `;
                playersListDiv.appendChild(playerDiv);
            });
        }
    }

    getRandomColor() {
        const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];
        return colors[Math.floor(Math.random() * colors.length)];
    }
}

// Initialize the game
window.boardGame = new BoardGame();