class BoardRenderer {
    constructor(svgElementId) {
        this.svg = document.getElementById(svgElementId);
    }

    renderBoard(boardData) {
        this.svg.innerHTML = ''; // Clear previous board
        
        boardData.forEach((space, index) => {
            const group = this.createSvgElement('g');
            
            const circle = this.createSvgElement('circle', {
                cx: space.x, cy: space.y, r: 20,
                fill: space.type === 'special' ? '#f39c12' : '#ecf0f1',
                stroke: '#2c3e50', 'stroke-width': 2
            });
            
            const text = this.createSvgElement('text', {
                x: space.x, y: space.y + 5,
                'text-anchor': 'middle', 'font-family': 'Space Mono',
                'font-size': '12', fill: '#2c3e50'
            });
            text.textContent = index;
            
            group.appendChild(circle);
            group.appendChild(text);
            this.svg.appendChild(group);
        });
    }

    renderPlayerPieces(players, boardData) {
        // Remove existing player pieces
        this.svg.querySelectorAll('.player-piece').forEach(piece => piece.remove());
        
        players.forEach(player => {
            const space = boardData[player.position];
            if (!space) return;

            const piece = this.createSvgElement('circle', {
                cx: space.x, cy: space.y - 30, r: 8,
                fill: player.color, stroke: '#ffffff', 'stroke-width': 2
            });
            piece.classList.add('player-piece');
            this.svg.appendChild(piece);
        });
    }

    createSvgElement(tag, attributes = {}) {
        const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
        for (const key in attributes) {
            el.setAttribute(key, attributes[key]);
        }
        return el;
    }
}

export default BoardRenderer;