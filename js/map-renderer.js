/**
 * Canvas 地图渲染器
 * 将图数据可视化为交互式地图
 */
class MapRenderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.dragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.hoverNode = null;
        this.selectedNode = null;
        this.routePath = [];
        this.currentIdx = -1;
        this.onNodeClick = null;

        this._bindEvents();
        this._resize();
        window.addEventListener('resize', () => this._resize());
    }

    _resize() {
        const parent = this.canvas.parentElement;
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = parent.clientWidth * dpr;
        this.canvas.height = parent.clientHeight * dpr;
        this.canvas.style.width = parent.clientWidth + 'px';
        this.canvas.style.height = parent.clientHeight + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.w = parent.clientWidth;
        this.h = parent.clientHeight;
        this.draw();
    }

    _bindEvents() {
        this.canvas.addEventListener('mousedown', e => {
            this.dragging = true;
            this.dragStart = { x: e.clientX - this.offsetX, y: e.clientY - this.offsetY };
        });
        window.addEventListener('mousemove', e => {
            if (this.dragging) {
                this.offsetX = e.clientX - this.dragStart.x;
                this.offsetY = e.clientY - this.dragStart.y;
                this.draw();
            } else {
                const node = this._hitTest(e);
                if (node !== this.hoverNode) {
                    this.hoverNode = node;
                    this.canvas.style.cursor = node ? 'pointer' : 'grab';
                    this.draw();
                }
            }
        });
        window.addEventListener('mouseup', () => { this.dragging = false; });
        this.canvas.addEventListener('click', e => {
            const node = this._hitTest(e);
            if (node && this.onNodeClick) this.onNodeClick(node);
        });
        this.canvas.addEventListener('wheel', e => {
            e.preventDefault();
            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            const rect = this.canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            this.offsetX = mx - (mx - this.offsetX) * factor;
            this.offsetY = my - (my - this.offsetY) * factor;
            this.scale *= factor;
            this.draw();
        }, { passive: false });
    }

    _hitTest(e) {
        if (!window.graph.nodes.length) return null;
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const bounds = graph.getBounds();
        const toX = lng => ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * this.w * this.scale + this.offsetX;
        const toY = lat => this.h - ((lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * this.h * this.scale + this.offsetY;

        for (const node of graph.nodes) {
            const nx = toX(node.lng);
            const ny = toY(node.lat);
            if ((mx-nx)**2 + (my-ny)**2 < 100) return node;
        }
        return null;
    }

    fitView() {
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.draw();
    }

    setRoute(path) {
        this.routePath = path;
        this.currentIdx = -1;
        this.draw();
    }

    setCurrentIndex(idx) {
        this.currentIdx = idx;
        this.draw();
    }

    setSelectedNode(id) {
        this.selectedNode = id;
        this.draw();
    }

    draw() {
        const ctx = this.ctx;
        const w = this.w;
        const h = this.h;
        ctx.clearRect(0, 0, w, h);

        if (!graph.nodes.length) return;

        const bounds = graph.getBounds();
        const toX = lng => ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * w * this.scale + this.offsetX;
        const toY = lat => h - ((lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * h * this.scale + this.offsetY;

        // 绘制所有边
        ctx.strokeStyle = '#1e2230';
        ctx.lineWidth = 1;
        graph.nodes.forEach(node => {
            node.edges.forEach(eid => {
                if (eid > node.id) { // 只画一次
                    const target = graph.nodes[eid];
                    ctx.beginPath();
                    ctx.moveTo(toX(node.lng), toY(node.lat));
                    ctx.lineTo(toX(target.lng), toY(target.lat));
                    ctx.stroke();
                }
            });
        });

        // 绘制路线
        if (this.routePath.length > 1) {
            ctx.strokeStyle = '#00b894';
            ctx.lineWidth = 3;
            ctx.setLineDash([]);
            ctx.beginPath();
            const maxIdx = this.currentIdx >= 0 ? this.currentIdx : this.routePath.length - 1;
            for (let i = 0; i <= maxIdx && i < this.routePath.length; i++) {
                const node = graph.getNode(this.routePath[i]);
                const x = toX(node.lng), y = toY(node.lat);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // 未走完的路线（虚线）
            if (this.currentIdx >= 0 && this.currentIdx < this.routePath.length - 1) {
                ctx.strokeStyle = '#2d3140';
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 4]);
                ctx.beginPath();
                for (let i = this.currentIdx; i < this.routePath.length; i++) {
                    const node = graph.getNode(this.routePath[i]);
                    const x = toX(node.lng), y = toY(node.lat);
                    if (i === this.currentIdx) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        // 绘制节点
        graph.nodes.forEach(node => {
            const x = toX(node.lng), y = toY(node.lat);
            const isHover = this.hoverNode && this.hoverNode.id === node.id;
            const isSelected = this.selectedNode === node.id;
            const isOnRoute = this.routePath.includes(node.id);

            ctx.beginPath();
            ctx.arc(x, y, isHover ? 7 : 5, 0, Math.PI * 2);
            ctx.fillStyle = isSelected ? '#6c5ce7' : isOnRoute ? '#00b894' : isHover ? '#a29bfe' : '#2d3140';
            ctx.fill();
            ctx.strokeStyle = isSelected ? '#a29bfe' : '#1e2230';
            ctx.lineWidth = 1;
            ctx.stroke();

            // 节点ID标签
            if (isHover || isSelected) {
                ctx.fillStyle = '#e4e6ed';
                ctx.font = '11px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(`#${node.id}`, x, y - 12);
            }
        });

        // 当前位置标记
        if (this.currentIdx >= 0 && this.currentIdx < this.routePath.length) {
            const node = graph.getNode(this.routePath[this.currentIdx]);
            const x = toX(node.lng), y = toY(node.lat);
            // 脉冲动画效果
            ctx.beginPath();
            ctx.arc(x, y, 12, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(225,112,85,0.2)';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#e17055';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }
}

window.MapRenderer = MapRenderer;
