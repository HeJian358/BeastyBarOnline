export const Network = {
    peer: null,
    connections: new Map(),
    myId: null,
    
    // 防洪记录表
    floodHistory: new Map(),

    init(onOpen, onData, onError) {
        // 如果之前有旧连接，先销毁
        if (this.peer) {
            this.peer.destroy();
        }

        this.peer = new Peer({ 
            debug: 2, 
            config: {
                iceServers: [
                    // 1. Google STUN (香港用户首选)
                    { urls: 'stun:stun.l.google.com:19302' },

                    // 2. 腾讯 STUN (国内用户/VPN不稳定时的备选)
                    { urls: 'stun:stun.qq.com:3478' },
                    
                    // 3. OpenRelay TURN (穿透防火墙的兜底方案)
                    {
                        urls: "turn:openrelay.metered.ca:80",
                        username: "openrelayproject",
                        credential: "openrelayproject"
                    },
                    {
                        urls: "turn:openrelay.metered.ca:443",
                        username: "openrelayproject",
                        credential: "openrelayproject"
                    },
                    {
                        urls: "turn:openrelay.metered.ca:443?transport=tcp",
                        username: "openrelayproject",
                        credential: "openrelayproject"
                    }
                ]
            }
        });

        this.peer.on('open', (id) => {
            this.myId = id;
            onOpen(id);
        });

        this.peer.on('connection', (conn) => this.handleConn(conn, onData));
        
        // 错误处理
        this.peer.on('error', (err) => {
            console.error("PeerJS 报错:", err);
            if (onError) onError(err);
        });

        this.peer.on('disconnected', () => {
            console.warn("与信令服务器断开，尝试重连...");
            this.peer.reconnect();
        });
    },

    connect(targetId, onData) {
        if (!targetId || targetId === this.myId) return;
        if (this.connections.has(targetId)) return;
        
        const conn = this.peer.connect(targetId);
        this.handleConn(conn, onData);
    },

    handleConn(conn, onData) {
        conn.on('open', () => {
            if (this.connections.has(conn.peer)) return;
            this.connections.set(conn.peer, conn);
            console.log("已连接:", conn.peer);
            onData({ type: 'SYS_USER_JOINED', peerId: conn.peer });
        });

        conn.on('data', (data) => {
            if (this.isSpam(data)) return;
            onData(data);
        });
        
        conn.on('close', () => {
            this.connections.delete(conn.peer);
            onData({ type: 'SYS_USER_LEFT', peerId: conn.peer });
        });
        
        conn.on('error', (err) => console.error("连接异常:", err));
    },

    isSpam(data) {
        const msgType = data.type;
        const limitTypes = ['SYNC_NICK', 'SYS_USER_JOINED', 'GAME_INIT'];
        if (!limitTypes.includes(msgType)) return false;

        const fingerprint = msgType + JSON.stringify(data);
        const now = Date.now();
        const lastTime = this.floodHistory.get(fingerprint) || 0;

        if (now - lastTime < 1000) return true; 

        this.floodHistory.set(fingerprint, now);
        if (this.floodHistory.size > 100) this.floodHistory.clear();
        return false;
    },

    broadcast(data) {
        this.connections.forEach(c => {
            if (c.open) c.send(data);
        });
    },

    getPlayerCount() {
        return this.connections.size + 1; 
    }
};

