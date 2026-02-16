import { createDeck } from './cardData.js';
import { Network } from './network.js';
import { UI } from './ui.js';
import { Store } from './store.js';

export const Game = {
    pendingCard: null,

    toggleReady() {
        Store.isReady = !Store.isReady;
        Network.broadcast({ type: 'PLAYER_READY', id: Network.myId, isReady: Store.isReady });
        this.updateReadyUI();
    },

    hostStart() {
        let allIds = Array.from(Network.connections.keys());
        allIds.push(Network.myId);
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

    onInit(data) {
        console.log("初始化:", data);
        Store.gameStarted = true;
        Store.turnIndex = 0;
        Store.gameQueue = [];
        this.pendingCard = null;
        
        Store.players = data.order.map((pid, idx) => ({
            id: pid, colorIdx: idx, nick: data.nicksMap[pid] || "未知玩家", handCount: 4
        }));

        Store.myDeck = createDeck(data.deckId);
        Store.myDeck.sort(() => Math.random() - 0.5);
        Store.myHand = Store.myDeck.splice(0, 4);

        UI.startGameUI();
        this.updateBoard();
        UI.log("🚀 游戏开始！");
    },

    playCard(cardUid) {
        const curPlayer = Store.players[Store.turnIndex];
        if (!curPlayer) return;
        if (curPlayer.id !== Network.myId) return UI.log("⚠️ 还没轮到你！");

        // 如果已经在选择中，点击手牌则取消选择
        if (this.pendingCard) {
            this.pendingCard = null;
            UI.log("已取消选择。");
            this.updateBoard();
            return;
        }

        const card = Store.myHand.find(c => c.uid === cardUid);
        if (!card) return;

        // --- 鹦鹉逻辑 ---
        if (card.id === 'parrot' && Store.gameQueue.length > 0) {
            this.pendingCard = card;
            UI.log("🦜 鹦鹉：请点击队列中的动物！");
            
            // 【关键修复】必须刷新队列，这样队列里的卡片才会变成“可点击状态”
            UI.renderQueue(Store.gameQueue, Store.players); 
            UI.renderHand(Store.myHand, Store.players.find(p=>p.id===Network.myId).colorIdx, true);
            return; 
        }

        // --- 袋鼠逻辑 ---
        if (card.id === 'kanga') {
            let jump = prompt("🦘 袋鼠：输入 1 或 2 跳过", "1");
            if (jump !== "1" && jump !== "2") return; 
            this.executeMove(card, { jump: parseInt(jump) });
            return;
        }

        // 普通出牌
        this.executeMove(card, {});
    },

    onQueueClick(targetUid) {
        // 只有在 pendingCard (鹦鹉模式) 下才响应
        if (!this.pendingCard) return;

        const targetExists = Store.gameQueue.find(c => c.uid === targetUid);
        if (!targetExists) {
            UI.log("❌ 目标不存在");
            return;
        }

        // 执行鹦鹉的出牌，带上 targetUid
        this.executeMove(this.pendingCard, { targetUid: targetUid });
        this.pendingCard = null;
    },

    executeMove(card, extraData) {
        const moveData = {
            type: 'GAME_MOVE',
            cardUid: card.uid,
            cardId: card.id,
            power: card.power,
            ownerId: Network.myId,
            extra: extraData || {}
        };
        Network.broadcast(moveData);
        this.processMove(moveData);
    },

    onMove(data) {
        if (data.ownerId === Network.myId) return;
        this.processMove(data);
    },

    processMove(data) {
        try {
            // 1. 手牌处理
            if (data.ownerId === Network.myId) {
                const idx = Store.myHand.findIndex(c => c.uid === data.cardUid);
                if (idx > -1) Store.myHand.splice(idx, 1);
                if (Store.myDeck.length > 0 && Store.myHand.length < 4) {
                    Store.myHand.push(Store.myDeck.pop());
                }
            } else {
                const p = Store.players.find(p => p.id === data.ownerId);
                if (p) UI.log(`🃏 ${p.nick} 打出了 [${data.power}] ${this._getName(data.cardId)}`);
            }

            // 2. 动物入场
            const newCard = {
                uid: data.cardUid, 
                id: data.cardId, 
                power: Number(data.power), // 【强制类型转换】防止字符串混入
                ownerId: data.ownerId
            };
            Store.gameQueue.push(newCard);

            // 3. 触发技能
            this.applySkill(newCard, data.extra);

            // 4. 门禁
            this.checkGate();

            // 5. 换人 & 刷新
            this.nextTurn();
            this.updateBoard();

        } catch (err) {
            console.error("❌ 逻辑错误:", err);
            UI.log("❌ 游戏出错，请查看控制台");
        }
    },

    applySkill(card, extra) {
        let queue = Store.gameQueue;
        
        // 🦨 臭鼬逻辑 (修复版)
        if (card.id === 'skunk') {
            let maxVal = -1;
            // 找最大值
            queue.forEach(c => {
                // 确保 power 是数字进行比较
                const p = Number(c.power);
                if (c.id !== 'skunk' && p > maxVal) maxVal = p;
            });

            console.log(`🦨 臭鼬判定: 最大力量是 ${maxVal}`);

            // 只有最大值大于1才生效
            if (maxVal > 1) {
                // 筛选：保留 (力量不等于最大值) 或者 (是臭鼬自己)
                // 注意：这里用 Number() 确保比较准确
                const keep = queue.filter(c => Number(c.power) !== maxVal || c.id === 'skunk');
                const kicked = queue.filter(c =>
