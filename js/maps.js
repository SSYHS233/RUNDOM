/**
 * 多地图加载器
 * 支持 unirun-web-main 格式的地图数据
 */
class MapLoader {
    constructor() {
        this.maps = {};
        this.mapNames = {};
        this.loaded = false;
    }

    async loadAll() {
        const mapFiles = [
            'cuit_hkg', 'cuit_hkg2', 'cuit_lqy',
            'cbyz', 'cdutcm_wj', 'gavtc', 'ncwsxx', 'sctbc', 'sptc', 'tsgzy'
        ];

        const results = await Promise.allSettled(
            mapFiles.map(id => fetch(`data/maps/${id}.json`).then(r => r.json()))
        );

        results.forEach((result, i) => {
            if (result.status === 'fulfilled' && result.value) {
                const mapId = result.value.mapId || mapFiles[i];
                this.maps[mapId] = result.value.mapData || [];
                this.mapNames[mapId] = result.value.mapName || mapId;
            }
        });

        this.loaded = true;
        return Object.keys(this.maps);
    }

    getMapIds() {
        return Object.keys(this.maps);
    }

    getMapName(mapId) {
        return this.mapNames[mapId] || mapId;
    }

    getMapData(mapId) {
        return this.maps[mapId] || [];
    }

    getDefaultMapId() {
        const ids = this.getMapIds();
        return ids.length > 0 ? ids[0] : null;
    }
}

window.mapLoader = new MapLoader();
