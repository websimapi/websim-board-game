class GameState {
    constructor() {
        this.reset();
        this.board = this.createBoard();
    }

    reset() {
        this.players = new Map(); // Map<playerId, {name, color, position, connection}>
        this.currentPlayerIndex = 0;
        this.gameStarted = false;
        this.isHost = false;
    }

    addPlayer(id, { name, color, connection }) {
        this.players.set(id, { id, name, color, position: 0, connection });
    }

    removePlayer(id) {
        this.players.delete(id);
        if (this.currentPlayerIndex >= this.players.size && this.players.size > 0) {
            this.currentPlayerIndex = this.players.size - 1;
        }
    }
    
    updatePlayerPosition(playerId, newPosition) {
        const player = this.players.get(playerId);
        if(player) player.position = newPosition;
    }
    
    nextTurn() {
        if (this.players.size > 0) {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.size;
        }
    }

    getCurrentPlayer() {
        return Array.from(this.players.values())[this.currentPlayerIndex];
    }
    
    getCurrentPlayerId() {
        return Array.from(this.players.keys())[this.currentPlayerIndex];
    }

    getSerializableState() {
        return {
            players: Array.from(this.players.values()).map(({ connection, ...rest }) => rest), // Don't serialize connection object
            currentPlayerIndex: this.currentPlayerIndex,
            gameStarted: this.gameStarted,
            isHost: this.isHost
        };
    }

    updateFromSerializedState(state) {
        // This is for clients. It doesn't restore connections, just player data for rendering.
        this.players.clear();
        state.players.forEach(p => this.players.set(p.id, p));
        this.currentPlayerIndex = state.currentPlayerIndex;
        this.gameStarted = state.gameStarted;
        // Don't update isHost, as that's determined locally.
    }

    getRandomColor() {
        const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];
        const usedColors = Array.from(this.players.values()).map(p => p.color);
        const availableColors = colors.filter(c => !usedColors.includes(c));
        return availableColors.length > 0 ? availableColors[0] : colors[Math.floor(Math.random() * colors.length)];
    }

    createBoard() {
        const spaces = [];
        const boardSize = 8; // Smaller board for larger spaces
        const spaceSize = 80; // Larger spaces
        const margin = 100;
        const width = 800;
        const height = 800;
        const specialSpaces = [3, 7, 11, 15, 19, 23];

        // Bottom row
        for (let i = 0; i < boardSize; i++) spaces.push({ x: i * spaceSize + margin, y: height - margin, type: specialSpaces.includes(spaces.length) ? 'special' : 'normal' });
        // Right col
        for (let i = 1; i < boardSize; i++) spaces.push({ x: (boardSize - 1) * spaceSize + margin, y: height - margin - i * spaceSize, type: specialSpaces.includes(spaces.length) ? 'special' : 'normal' });
        // Top row
        for (let i = 1; i < boardSize; i++) spaces.push({ x: (boardSize - 1) * spaceSize + margin - i * spaceSize, y: margin, type: specialSpaces.includes(spaces.length) ? 'special' : 'normal' });
        // Left col
        for (let i = 1; i < boardSize - 1; i++) spaces.push({ x: margin, y: margin + i * spaceSize, type: specialSpaces.includes(spaces.length) ? 'special' : 'normal' });
        
        return spaces;
    }
}

export default GameState;