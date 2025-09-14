import QRCode from 'qrcode';

class UIManager {
    constructor(callbacks) {
        this.callbacks = callbacks;
        this.elements = {
            screens: document.querySelectorAll('.screen'),
            mainMenu: document.getElementById('main-menu'),
            hostSetup: document.getElementById('host-setup'),
            playerSetup: document.getElementById('player-setup'),
            gameBoard: document.getElementById('game-board'),

            hostBtn: document.getElementById('host-btn'),
            joinBtn: document.getElementById('join-btn'),
            backToMenuBtn: document.getElementById('back-to-menu'),
            backToMenuPlayerBtn: document.getElementById('back-to-menu-player'),
            startGameBtn: document.getElementById('start-game-btn'),
            rollDiceBtn: document.getElementById('roll-dice-btn'),
            joinGameBtn: document.getElementById('join-game-btn'),
            sendChatBtn: document.getElementById('send-chat-btn'),
            hostPanelToggle: document.getElementById('host-panel-toggle'),

            qrCanvas: document.getElementById('qr-code'),
            joinUrl: document.getElementById('join-url'),
            playersList: document.getElementById('players'),
            connectionStatus: document.getElementById('connection-status'),
            playerNameInput: document.getElementById('player-name'),
            chatInput: document.getElementById('chat-input'),

            currentPlayerName: document.getElementById('current-player-name'),
            diceDisplay: document.getElementById('dice-display'),
            gamePlayersList: document.getElementById('game-players-list'),
            gameLog: document.getElementById('game-log'),
            gameSidebar: document.getElementById('game-sidebar'),
        };
        
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.elements.hostBtn.addEventListener('click', () => this.callbacks.onHostGame());
        this.elements.joinBtn.addEventListener('click', () => this.callbacks.onJoinGame());
        this.elements.backToMenuBtn.addEventListener('click', () => this.callbacks.onBackToMenu());
        this.elements.backToMenuPlayerBtn.addEventListener('click', () => this.callbacks.onBackToMenu());
        this.elements.startGameBtn.addEventListener('click', () => this.callbacks.onStartGame());
        this.elements.rollDiceBtn.addEventListener('click', () => this.callbacks.onRollDice());
        this.elements.sendChatBtn.addEventListener('click', () => this.handleSendChat());
        this.elements.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSendChat();
        });
        this.elements.hostPanelToggle.addEventListener('click', () => this.toggleHostPanel());
    }

    checkForJoinUrl(callback) {
        const urlParams = new URLSearchParams(window.location.search);
        const peerjsId = urlParams.get('peerjsid');
        if (peerjsId) {
            callback(peerjsId);
        }
    }
    
    showScreen(screenId) {
        this.elements.screens.forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }

    isScreenActive(screenId) {
        return document.getElementById(screenId).classList.contains('active');
    }

    showMainMenu() {
        this.showScreen('main-menu');
        document.body.classList.remove('host-view'); // Clean up class on exit
        window.history.pushState({}, document.title, window.location.pathname);
    }
    
    showJoinScreen() {
        this.showScreen('player-setup');
        this.updateConnectionStatus('connecting', 'Enter game ID or scan QR code');
    }

    enableHostView() {
        document.body.classList.add('host-view');
    }

    toggleHostPanel() {
        this.elements.gameSidebar.classList.toggle('open');
    }

    async displayQRCode(peerId) {
        const joinUrl = `https://boardgames.on.websim.com/?peerjsid=${peerId}`;
        this.elements.joinUrl.textContent = joinUrl;
        try {
            await QRCode.toCanvas(this.elements.qrCanvas, joinUrl, {
                width: 200, margin: 2, color: { dark: '#2c3e50', light: '#ffffff' }
            });
        } catch (error) {
            console.error('Failed to generate QR code:', error);
        }
    }

    updatePlayersList(players) {
        this.elements.playersList.innerHTML = '';
        players.forEach(player => {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'player-item';
            playerDiv.innerHTML = `<div class="player-color" style="background-color: ${player.color}"></div><span>${player.name}</span>`;
            this.elements.playersList.appendChild(playerDiv);
        });
        this.elements.startGameBtn.disabled = players.length < 1;
    }

    updateConnectionStatus(status, message) {
        const el = this.elements.connectionStatus;
        el.textContent = message;
        el.className = '';
        if (status === 'connected') el.classList.add('status-connected');
        else if (status === 'error') el.classList.add('status-error');
        else el.classList.add('status-connecting');
    }
    
    enablePlayerJoin(onJoinCallback) {
        this.elements.joinGameBtn.style.display = 'block';
        const joinHandler = () => {
            const name = this.elements.playerNameInput.value.trim();
            if (name) {
                onJoinCallback(name);
                this.elements.joinGameBtn.disabled = true;
            }
        };
        this.elements.joinGameBtn.onclick = joinHandler;
        this.elements.playerNameInput.onkeypress = (e) => {
            if (e.key === 'Enter') joinHandler();
        };
    }

    updateGameDisplay(gameState, localPlayerId) {
        if (!gameState) return;
        
        const currentPlayer = gameState.players[gameState.currentPlayerIndex];
        this.elements.currentPlayerName.textContent = currentPlayer ? currentPlayer.name : 'N/A';
        
        this.updateGamePlayersList(gameState.players, gameState.currentPlayerIndex);

        if (gameState.isHost) {
            this.elements.rollDiceBtn.disabled = false;
        } else {
            const localPlayer = gameState.players.find(p => p.id === localPlayerId);
            const isMyTurn = localPlayer && gameState.players[gameState.currentPlayerIndex]?.id === localPlayer.id;
            this.elements.rollDiceBtn.disabled = !isMyTurn;
        }
    }
    
    updateGamePlayersList(players, currentPlayerIndex) {
        this.elements.gamePlayersList.innerHTML = '';
        if (!players) return;
        players.forEach((player, index) => {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'game-player-item';
            if (index === currentPlayerIndex) {
                playerDiv.classList.add('current');
            }
            playerDiv.innerHTML = `<div class="player-color" style="background-color: ${player.color}"></div><span>${player.name}</span>`;
            this.elements.gamePlayersList.appendChild(playerDiv);
        });
    }

    updateDiceDisplay(value) {
        const el = this.elements.diceDisplay;
        el.textContent = value;
        el.style.transform = 'scale(1.3)';
        setTimeout(() => {
            el.style.transform = 'scale(1)';
        }, 200);
    }

    addLogEntry(data, type) {
        const entry = document.createElement('div');
        if (type === 'log') {
            entry.className = 'log-entry';
            entry.textContent = `${new Date().toLocaleTimeString()}: ${data}`;
        } else if (type === 'chat') {
            entry.className = 'chat-entry';
            entry.innerHTML = `<strong>${data.sender}:</strong> ${data.message}`;
        }
        this.elements.gameLog.appendChild(entry);
        this.elements.gameLog.scrollTop = this.elements.gameLog.scrollHeight;
    }

    handleSendChat() {
        const message = this.elements.chatInput.value.trim();
        if (message) {
            this.callbacks.onSendChat(message);
            this.elements.chatInput.value = '';
        }
    }

    playDiceSound() {
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(400, this.audioContext.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.1);
    }
}

export default UIManager;