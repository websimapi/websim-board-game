import { Peer } from 'peerjs';

class NetworkManager {
    constructor(callbacks) {
        this.callbacks = callbacks;
        this.peer = null;
        this.isHost = false;
        this.hostConnection = null;
        this.connections = new Map();
    }

    async startHosting() {
        this.isHost = true;
        this.peer = new Peer();
        
        return new Promise((resolve) => {
            this.peer.on('open', (id) => {
                console.log('Host peer ID:', id);
                resolve(id);
            });

            this.peer.on('connection', (conn) => this.handleNewConnection(conn));

            this.peer.on('error', (error) => {
                console.error('Peer error:', error);
                this.callbacks.onConnectionError(error);
            });
        });
    }

    joinGame(hostId) {
        this.isHost = false;
        this.peer = new Peer();
        
        this.peer.on('open', (id) => {
            console.log('Player peer ID:', id);
            const conn = this.peer.connect(hostId);
            this.handleHostConnection(conn);
        });

        this.peer.on('error', (error) => {
            console.error('Connection error:', error);
            this.callbacks.onConnectionError(error);
        });
    }

    handleNewConnection(conn) {
        conn.on('open', () => {
            console.log('Player connected:', conn.peer);
            this.connections.set(conn.peer, conn);
            this.callbacks.onPlayerConnected(conn);
        });
        conn.on('data', (data) => this.callbacks.onDataReceived(conn, data));
        conn.on('close', () => {
            this.connections.delete(conn.peer);
            this.callbacks.onPlayerDisconnected(conn);
        });
    }
    
    handleHostConnection(conn) {
        this.hostConnection = conn;
        conn.on('open', () => {
            console.log('Connected to host');
            this.callbacks.onConnectedToHost(conn);
        });
        conn.on('data', (data) => this.callbacks.onDataReceived(conn, data));
        conn.on('close', () => {
            console.log('Connection to host lost');
            this.hostConnection = null;
        });
    }

    broadcast(data) {
        if (!this.isHost) return;
        this.connections.forEach(conn => {
            if (conn.open) conn.send(data);
        });
    }

    sendToHost(data) {
        if (this.isHost || !this.hostConnection || !this.hostConnection.open) return;
        this.hostConnection.send(data);
    }
    
    disconnect() {
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
        this.connections.clear();
        this.hostConnection = null;
        this.isHost = false;
    }
}

export default NetworkManager;

