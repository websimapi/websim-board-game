import UIManager from './UIManager.js';
import NetworkManager from './NetworkManager.js';
import GameState from './GameState.js';
import BoardRenderer from './BoardRenderer.js';

class GameManager {
    constructor() {
        this.uiManager = new UIManager({
            onHostGame: () => this.hostGame(),
            onJoinGame: () => this.uiManager.showJoinScreen(),
            onStartGame: () => this.startGame(),
            onRollDice: () => this.rollDice(),
            onBackToMenu: () => this.goBackToMenu(),
            onSendChat: (message) => this.sendChat(message)
        });

        this.networkManager = new NetworkManager({
            onPlayerConnected: (conn) => this.handlePlayerConnection(conn),
            onPlayerDisconnected: (conn) => this.handlePlayerDisconnection(conn),
            onDataReceived: (conn, data) => this.handleDataReceived(conn, data),
            onConnectedToHost: (conn) => this.handleHostConnection(conn),
            onConnectionError: (error) => this.handleConnectionError(error)
        });

        this.gameState = new GameState();
        this.boardRenderer = new BoardRenderer('game-board-svg');

        this.uiManager.checkForJoinUrl((hostId) => this.joinGame(hostId));
    }

    async hostGame() {
        this.gameState.isHost = true;
        this.uiManager.showScreen('host-setup');
        const peerId = await this.networkManager.startHosting();
        if (peerId) {
            this.uiManager.displayQRCode(peerId);
        }
    }

    joinGame(hostId) {
        this.gameState.isHost = false;
        this.uiManager.showScreen('player-setup');
        this.networkManager.joinGame(hostId);
    }

    goBackToMenu() {
        this.networkManager.disconnect();
        this.gameState.reset();
        this.uiManager.showMainMenu();
    }
    
    startGame() {
        if (this.gameState.isHost && this.gameState.players.size >= 1) {
            this.gameState.gameStarted = true;
            this.broadcastGameState();
            this.showGameBoard();
            this.addLogMessage(`${Array.from(this.gameState.players.values())[0].name} starts the game.`);
        }
    }

    showGameBoard() {
        this.uiManager.showScreen('game-board');
        if(this.gameState.isHost) {
            this.uiManager.enableHostView();
        }
        this.boardRenderer.renderBoard(this.gameState.board);
        this.updateGameUI();
    }

    updateGameUI() {
        this.uiManager.updateGameDisplay(this.gameState.getSerializableState(), this.networkManager.peer?.id);
        this.boardRenderer.renderPlayerPieces(Array.from(this.gameState.players.values()), this.gameState.board);
    }
    
    broadcastGameState() {
        if (!this.gameState.isHost) return;
        const state = this.gameState.getSerializableState();
        this.networkManager.broadcast({ type: 'game-state', gameState: state });
    }

    handlePlayerConnection(conn) {
        // Player connection is handled when they send their info
    }

    handlePlayerDisconnection(conn) {
        if (!this.gameState.isHost) return;
        const player = this.gameState.players.get(conn.peer);
        if (player) {
            this.addLogMessage(`${player.name} has disconnected.`);
            this.gameState.removePlayer(conn.peer);
            this.uiManager.updatePlayersList(Array.from(this.gameState.players.values()));
            this.broadcastGameState();
            this.updateGameUI();
        }
    }

    handleHostConnection(conn) {
        this.uiManager.updateConnectionStatus('connected', 'Connected! Enter your name:');
        this.uiManager.enablePlayerJoin((name) => {
            const playerInfo = {
                type: 'player-join',
                name: name,
                color: this.gameState.getRandomColor()
            };
            conn.send(playerInfo);
            this.uiManager.updateConnectionStatus('connected', 'Joining game...');
        });
    }

    handleConnectionError(error) {
        this.uiManager.updateConnectionStatus('error', `Failed to connect: ${error.type}`);
    }

    handleDataReceived(conn, data) {
        if (this.gameState.isHost) {
            this.handlePlayerMessage(conn, data);
        } else {
            this.handleHostMessage(data);
        }
    }

    handlePlayerMessage(conn, data) {
        switch (data.type) {
            case 'player-join':
                this.gameState.addPlayer(conn.peer, { name: data.name, color: data.color, connection: conn });
                conn.send({ type: 'join-confirmed', playerId: conn.peer });
                this.uiManager.updatePlayersList(Array.from(this.gameState.players.values()));
                this.broadcastGameState();
                this.addLogMessage(`${data.name} joined the game.`);
                break;
            case 'dice-roll':
                this.processDiceRoll(conn.peer, data.value);
                break;
            case 'chat-message':
                const sender = this.gameState.players.get(conn.peer);
                this.broadcastChatMessage(data.message, sender.name);
                break;
        }
    }

    handleHostMessage(data) {
        switch (data.type) {
            case 'game-state':
                this.gameState.updateFromSerializedState(data.gameState);
                if (this.gameState.gameStarted && !this.uiManager.isScreenActive('game-board')) {
                    this.showGameBoard();
                } else {
                    this.updateGameUI();
                }
                break;
            case 'join-confirmed':
                this.uiManager.updateConnectionStatus('connected', 'Successfully joined! Waiting for game to start...');
                break;
            case 'dice-result':
                this.uiManager.updateDiceDisplay(data.value);
                break;
            case 'game-log':
                this.uiManager.addLogEntry(data.message, 'log');
                break;
            case 'chat-message':
                this.uiManager.addLogEntry({ sender: data.playerName, message: data.message }, 'chat');
                break;
            case 'error':
                 console.warn("Received error from host:", data.message);
                 break;
        }
    }

    addLogMessage(message) {
        this.uiManager.addLogEntry(message, 'log');
        if (this.gameState.isHost) {
            this.networkManager.broadcast({ type: 'game-log', message });
        }
    }

    sendChat(message) {
        if (this.gameState.isHost) {
            const hostPlayer = { name: "Host" }; // Or a named host player
            this.broadcastChatMessage(message, hostPlayer.name);
        } else {
            this.networkManager.sendToHost({ type: 'chat-message', message });
        }
    }

    broadcastChatMessage(message, playerName) {
        this.uiManager.addLogEntry({ sender: playerName, message: message }, 'chat');
        if (this.gameState.isHost) {
            this.networkManager.broadcast({ type: 'chat-message', message, playerName });
        }
    }

    rollDice() {
        const value = Math.floor(Math.random() * 6) + 1;
        this.uiManager.playDiceSound();
        
        if (this.gameState.isHost) {
            const currentPlayerId = this.gameState.getCurrentPlayerId();
            this.processDiceRoll(currentPlayerId, value);
        } else {
            this.networkManager.sendToHost({ type: 'dice-roll', value: value });
        }
    }

    processDiceRoll(playerId, diceValue) {
        if (!this.gameState.isHost) return;

        if (playerId !== this.gameState.getCurrentPlayerId()) {
            const player = this.gameState.players.get(playerId);
            if (player && player.connection) {
                player.connection.send({type: 'error', message: "Not your turn."});
            }
            return;
        }
        
        const currentPlayer = this.gameState.getCurrentPlayer();
        this.addLogMessage(`${currentPlayer.name} rolled a ${diceValue}.`);

        this.uiManager.updateDiceDisplay(diceValue);
        this.networkManager.broadcast({ type: 'dice-result', value: diceValue });

        const oldPosition = currentPlayer.position;
        let newPosition = (oldPosition + diceValue) % this.gameState.board.length;
        this.gameState.updatePlayerPosition(playerId, newPosition);

        this.addLogMessage(`${currentPlayer.name} moved from space ${oldPosition} to ${newPosition}.`);
        
        const currentSpace = this.gameState.board[newPosition];
        if (currentSpace.type === 'special') {
            this.handleSpecialSpace(playerId);
        }
        
        this.gameState.nextTurn();
        this.broadcastGameState();
        this.updateGameUI();
    }
    
    handleSpecialSpace(playerId) {
        const player = this.gameState.players.get(playerId);
        const effects = [
            { text: 'moves forward 3 spaces!', action: () => { player.position = (player.position + 3) % this.gameState.board.length; }},
            { text: 'moves back 2 spaces!', action: () => { player.position = Math.max(0, player.position - 2); }},
            { text: 'gets to roll again!', action: () => { this.gameState.currentPlayerIndex = (this.gameState.currentPlayerIndex - 1 + this.gameState.players.size) % this.gameState.players.size; }}
        ];
        
        const effect = effects[Math.floor(Math.random() * effects.length)];
        effect.action();
        this.gameState.updatePlayerPosition(playerId, player.position);
        this.addLogMessage(`${player.name} landed on a special space and ${effect.text}`);
    }
}

export default GameManager;