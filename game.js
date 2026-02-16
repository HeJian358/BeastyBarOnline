import { createDeck } from './cardData.js';
import { Network } from './network.js';
import { UI } from './ui.js';
import { Store } from './store.js'; // 【新增】

export const Game = {
    // 删除了 state, myNick, myDeck 等属性，全部移到 Store

    toggleReady() {
        Store.isReady = !Store.isReady; // 【修改】操作 Store
        Network.broadcast({ 
            type: 'PLAYER_READY', 
            id: Network.myId, 
            isReady: Store.isReady 
        });
        this.updateReadyUI();
    },

    hostStart() {
        let allIds = Array.from(Network.connections.keys());
        allIds.push(Network.myId);
        allIds.sort(() => Math.random() - 0.5);

        const nicksMap = {};
        allIds.forEach(id => {
            // 【修改】从 Store 读取
            nicksMap[id] = (id === Network.myId) ? Store.myNick : (Store.nicks.get(id) || "Player");
        });

        const initData = {
            type: 'GAME_INIT',
            order: allIds,
            deckId: 'set1',
            seed: Date.now(),
            nicksMap: nicksMap
        };
        
        Network.broadcast(initData);
        this.onInit(initData);
    },

    onInit(data) {
        Store.gameStarted = true;
        Store.turnIndex = 0;
        Store.gameQueue = [];
        
        // 【修改】更新 Store
        Store.players = data.order.map((pid, idx) => ({
            id: pid,
            colorIdx: idx, 
            nick: data.nicksMap[pid] || "未知玩家",
            handCount: 4
        }));

        Store.myDeck = createDeck(data.deckId);
        Store.myDeck.sort(() => Math.random() - 0.5);
        Store.myHand = Store.myDeck.splice(0, 4);

        UI.startGameUI();
        this.updateBoard();
        UI.log("🚀 游戏开始！");
    },

    updateBoard() {
        // 【修改】从 Store 读取数据传给 UI
        const curPlayer = Store.players[Store.turnIndex];
        const isMyTurn = curPlayer.id === Network.myId;
        
        UI.renderQueue(Store.gameQueue, Store.players);
        
        const me = Store.players.find(p => p.id === Network.myId);
        UI.renderHand(Store.myHand, me ? me.colorIdx : 0, isMyTurn);
        
        UI.renderInGamePlayers(Store.players, Store.turnIndex);
        UI.updateTurnInfo(curPlayer.nick, isMyTurn);
        UI.updateDeckInfo(Store.myDeck.length);
    },

    updateReadyUI() {
        if (Store.amIHost) { // 【修改】
            const btnStart = document.getElementById('btn-start');
            btnStart.disabled = !Store.isReady;
            if(Store.isReady) btnStart.innerText = "🚀 开始游戏";
            else btnStart.innerText = "✋ 房主请先准备";
        } else {
            const btnReady = document.getElementById('btn-ready');
            btnReady.innerText = Store.isReady ? "取消准备" : "✋ 准备";
            btnReady.style.backgroundColor = Store.isReady ? "#bdc3c7" : "#f1c40f";
        }
    }
};