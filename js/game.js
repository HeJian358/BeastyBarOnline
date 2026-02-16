import { createDeck } from './cardData.js';
import { Network } from './network.js';
import { UI } from './ui.js';
import { Store } from './store.js';

export const Game = {
    // 切换准备状态
    toggleReady() {
        Store.isReady = !Store.isReady;
        Network.broadcast({ 
            type: 'PLAYER_READY', 
            id: Network.myId, 
            isReady: Store.isReady 
        });
        this.updateReadyUI();
    },

    // 房主开始游戏
    hostStart() {
        let allIds = Array.from(Network.connections.keys());
        allIds.push(Network.myId);
        // 随机打乱行动顺序
        allIds.sort(() => Math.random() - 0.5);

        const nicksMap = {};
        allIds.forEach(id => {
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

    // 游戏初始化
    onInit(data) {
        Store.gameStarted = true;
        Store.turnIndex = 0;
        Store.gameQueue = [];
        
        // 初始化玩家列表
        Store.players = data.order.map((pid, idx) => ({
            id: pid,
            colorIdx: idx, 
            nick: data.nicksMap[pid] || "未知玩家",
            handCount: 4
        }));

        // 初始化我的牌库
        Store.myDeck = createDeck(data.deckId);
        // 简单洗牌
        Store.myDeck.sort(() => Math.random() - 0.5);
        // 初始发 4 张牌
        Store.myHand = Store.myDeck.splice(0, 4);

        UI.startGameUI();
        this.updateBoard();
        UI.log("🚀 游戏开始！请按顺序出牌。");
    },

    // 【新增】玩家点击卡牌触发
    playCard(cardUid) {
        // 1. 检查是不是轮到我
        const curPlayer = Store.players[Store.turnIndex];
        if (curPlayer.id !== Network.myId) {
            UI.log("⚠️ 还没轮到你！");
            return;
        }

        // 2. 检查手里有没有这张牌
        const cardIndex = Store.myHand.findIndex(c => c.uid === cardUid);
        if (cardIndex === -1) return;
        const card = Store.myHand[cardIndex];

        // 3. 发送出牌指令
        Network.broadcast({
            type: 'GAME_MOVE',
            cardUid: card.uid,
            cardId: card.id, // 比如 'lion'
            power: card.power,
            ownerId: Network.myId
        });

        // 4. 本地立刻响应（为了流畅体验，本地先执行，不等网络回包）
        this.handleCardMove(card, cardIndex);
    },

    // 【新增】收到别人（或自己）出牌的消息
    onMove(data) {
        // 如果是自己出的牌，本地已经处理过了，忽略
        if (data.ownerId === Network.myId) return;

        // 找到出牌的人
        const player = Store.players.find(p => p.id === data.ownerId);
        if (player) {
            UI.log(`🃏 ${player.nick} 打出了 [${data.power}]`);
            // 别人的手牌数 -1
            player.handCount--;
        }

        // 将这张牌加入队列
        const newCard = {
            uid: data.cardUid,
            id: data.cardId,
            power: data.power,
            ownerId: data.ownerId
        };
        Store.gameQueue.push(newCard);

        // 轮到下一个人
        this.nextTurn();
        this.updateBoard();
    },

    // 处理自己出牌的逻辑（移除手牌 + 补牌）
    handleCardMove(card, index) {
        UI.log(`我打出了 [${card.power}] ${card.text}`);

        // 1. 从手牌移除
        Store.myHand.splice(index, 1);

        // 2. 加入公共队列
        Store.gameQueue.push({
            uid: card.uid,
            id: card.id,
            power: card.power,
            ownerId: Network.myId
        });

        // 3. 自动补牌 (如果牌库还有牌)
        if (Store.myDeck.length > 0) {
            const newCard = Store.myDeck.pop();
            Store.myHand.push(newCard);
            // UI.log("📦 摸了一张牌");
        }

        // 4. 切换轮次
        this.nextTurn();
        this.updateBoard();
    },

    // 计算下一回合是谁
    nextTurn() {
        Store.turnIndex = (Store.turnIndex + 1) % Store.players.length;
    },

    // 刷新界面
    updateBoard() {
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
        if (Store.amIHost) {
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
