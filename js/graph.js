/**
 * 图结构 + 路径规划
 * 基于APK中的map.json真实数据
 */
class Graph {
    constructor() {
        this.nodes = [];
        this.adj = {};
    }

    async load(url) {
        const res = await fetch(url);
        const data = await res.json();
        this.nodes = data.map(n => {
            const [lng, lat] = n.location.split(',').map(Number);
            return { id: n.id, lat, lng, edges: n.edge };
        });
        this.nodes.forEach(n => {
            this.adj[n.id] = n.edges.map(eid => {
                const target = this.nodes[eid];
                return { id: eid, dist: this.haversine(n.lat, n.lng, target.lat, target.lng) };
            });
        });
    }

    haversine(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const toRad = d => d * Math.PI / 180;
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    // Dijkstra 最短路径
    shortestPath(startId, endId) {
        const dist = {};
        const prev = {};
        const visited = new Set();
        const pq = [];

        this.nodes.forEach(n => { dist[n.id] = Infinity; });
        dist[startId] = 0;
        pq.push({ id: startId, d: 0 });

        while (pq.length) {
            pq.sort((a, b) => a.d - b.d);
            const { id: u } = pq.shift();
            if (visited.has(u)) continue;
            visited.add(u);
            if (u === endId) break;

            for (const { id: v, dist: w } of (this.adj[u] || [])) {
                if (visited.has(v)) continue;
                const nd = dist[u] + w;
                if (nd < dist[v]) {
                    dist[v] = nd;
                    prev[v] = u;
                    pq.push({ id: v, d: nd });
                }
            }
        }

        // 回溯路径
        const path = [];
        let cur = endId;
        while (cur !== undefined) {
            path.unshift(cur);
            cur = prev[cur];
        }
        if (path[0] !== startId) return null;
        return { path, distance: dist[endId] };
    }

    // BFS 随机游走生成指定距离的路线
    generateRoute(startId, targetDistance) {
        const visited = [startId];
        let totalDist = 0;
        let current = startId;
        const visitedSet = new Set([startId]);

        while (totalDist < targetDistance) {
            const neighbors = (this.adj[current] || []).filter(n => !visitedSet.has(n.id));
            let next;
            if (neighbors.length > 0) {
                next = neighbors[Math.floor(Math.random() * neighbors.length)];
            } else {
                // 回退一步再选
                if (visited.length < 2) break;
                visited.pop();
                current = visited[visited.length - 1];
                continue;
            }
            totalDist += next.dist;
            current = next.id;
            visited.push(current);
            visitedSet.add(current);
        }

        return { path: visited, distance: totalDist };
    }

    // 生成带中间点的长距离路线（走多段）
    generateLongRoute(startId, targetDistance) {
        const allNodes = this.nodes.map(n => n.id);
        const waypoints = [startId];
        let remaining = targetDistance;

        // 随机选几个中间节点
        const midCount = Math.max(2, Math.floor(targetDistance / 400));
        const candidates = allNodes.filter(id => id !== startId);
        for (let i = 0; i < midCount && candidates.length > 0; i++) {
            const idx = Math.floor(Math.random() * candidates.length);
            waypoints.push(candidates.splice(idx, 1)[0]);
        }
        waypoints.push(startId); // 回到起点

        const fullPath = [];
        let totalDist = 0;

        for (let i = 0; i < waypoints.length - 1; i++) {
            const result = this.shortestPath(waypoints[i], waypoints[i+1]);
            if (!result) continue;
            const seg = i === 0 ? result.path : result.path.slice(1);
            fullPath.push(...seg);
            totalDist += result.distance;
        }

        return { path: fullPath, distance: totalDist };
    }

    getNode(id) {
        return this.nodes[id];
    }

    getBounds() {
        let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
        this.nodes.forEach(n => {
            minLat = Math.min(minLat, n.lat);
            maxLat = Math.max(maxLat, n.lat);
            minLng = Math.min(minLng, n.lng);
            maxLng = Math.max(maxLng, n.lng);
        });
        const pad = 0.0005;
        return { minLat: minLat-pad, maxLat: maxLat+pad, minLng: minLng-pad, maxLng: maxLng+pad };
    }
}

window.graph = new Graph();
