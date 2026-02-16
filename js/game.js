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
        console.log("游戏初始化:", data);
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
        // 安全检查：防止 curPlayer 未定义导致报错
        if (!curPlayer) return console.error("当前回合玩家未定义!");
        
        if (curPlayer.id !== Network.myId) return UI.log("⚠️ 还没轮到你！");

        if (this.pendingCard) {
            this.pendingCard = null;
            UI.log("已取消选择。");
            this.updateBoard();
            return;
        }

        const card = Store.myHand.find(c => c.uid === cardUid);
        if (!card) return;

        // 特殊技能交互
        if (card.id === 'parrot' && Store.gameQueue.length > 0) {
            this.pendingCard = card;
            UI.log("🦜 鹦鹉：请点击队列中的动物！");
            UI.renderHand(Store.myHand, Store.players.find(p=>p.id===Network.myId).colorIdx, true);
            return; 
        }

        if (card.id === 'kanga') {
            let jump = prompt("🦘 袋鼠：输入 1 或 2 跳过", "1");
            if (jump !== "1" && jump !== "2") return; 
            this.executeMove(card, { jump: parseInt(jump) });
            return;
        }

        this.executeMove(card, {});
    },

    onQueueClick(targetUid) {
        if (!this.pendingCard) return;
        const targetExists = Store.gameQueue.find(c => c.uid === targetUid);
        if (!targetExists) return;

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

    // 核心处理逻辑 (带防崩溃保护)
    processMove(data) {
        try {
            console.log("处理移动:", data);

            // 1. 处理手牌与补牌
            if (data.ownerId === Network.myId) {
                const idx = Store.myHand.findIndex(c => c.uid === data.cardUid);
                if (idx > -1) Store.myHand.splice(idx, 1);
                // 只有当牌库有牌，且手牌不足4张时才补（防止溢出）
                if (Store.myDeck.length > 0 && Store.myHand.length < 4) {
                    Store.myHand.push(Store.myDeck.pop());
                }
            } else {
                const p = Store.players.find(p => p.id === data.ownerId);
                if (p) {
                    // 对方出牌动画日志
                    UI.log(`🃏 ${p.nick} 打出了 [${data.power}] ${this._getName(data.cardId)}`);
                }
            }

            // 2. 动物入场
            const newCard = {
                uid: data.cardUid, 
                id: data.cardId, 
                power: data.power, 
                ownerId: data.ownerId
            };
            Store.gameQueue.push(newCard);

            // 3. 触发技能
            this.applySkill(newCard, data.extra);

            // 4. 检查门禁
            this.checkGate();

            // 5. 切换回合
            this.nextTurn();
            
            // 6. 刷新界面
            this.updateBoard();

        } catch (err) {
            console.error("❌ 游戏逻辑严重错误:", err);
            UI.log("❌ 游戏出错，请按F12查看控制台");
        }
    },

    applySkill(card, extra) {
        let queue = Store.gameQueue;
        
        if (card.id === 'skunk') {
            let maxVal = -1;
            queue.forEach(c => {
                if (c.id !== 'skunk' && c.power > maxVal) maxVal = c.power;
            });
            if (maxVal > 1) { // 只有比1大才熏走
                const keep = queue.filter(c => c.power !== maxVal || c.id === 'skunk');
                const kicked = queue.filter(c => c.power === maxVal && c.id !== 'skunk');
                Store.gameQueue = keep;
                if (kicked.length > 0) UI.log(`💨 臭鼬熏走了: ${kicked.map(v=>v.power).join(',')}`);
            }
        }
        else if (card.id === 'parrot' && extra && extra.targetUid) {
            const idx = queue.findIndex(c => c.uid === extra.targetUid);
            if (idx !== -1) {
                const v = queue[idx];
                queue.splice(idx, 1);
                UI.log(`🦜 鹦鹉骂跑了 [${v.power}] ${this._getName(v.id)}`);
            }
        }
        else if (card.id === 'kanga' && extra && extra.jump) {
            const kangaIdx = queue.length - 1;
            let targetIdx = kangaIdx - extra.jump;
            if (targetIdx < 0) targetIdx = 0;
            
            if (targetIdx < kangaIdx) {
                const kanga = queue.pop();
                queue.splice(targetIdx, 0, kanga);
                UI.log(`🦘 袋鼠往前跳了 ${extra.jump} 步`);
            }
        }
    },

    checkGate() {
        if (Store.gameQueue.length === 5) {
            UI.log("🚪 门口满了！结算中...");
            const toBar = Store.gameQueue.slice(0, 2);
            const remain = Store.gameQueue.slice(2, 4);
            const toTrash = Store.gameQueue.slice(4, 5);

            toBar.forEach(c => UI.log(`🍻 [${c.power}] ${this._getName(c.id)} 进酒吧！`));
            toTrash.forEach(c => UI.log(`🗑️ [${c.power}] ${this._getName(c.id)} 被踢出！`));

            Store.gameQueue = remain; 
        }
    },

    nextTurn() {
        if (Store.players.length === 0) return;
        Store.turnIndex = (Store.turnIndex + 1) % Store.players.length;
        console.log("轮次切换到:", Store.turnIndex);
    },

    updateBoard() {
        const curPlayer = Store.players[Store.turnIndex];
        const isMyTurn = curPlayer && curPlayer.id === Network.myId;
        
        UI.renderQueue(Store.gameQueue, Store.players);
        
        const me = Store.players.find(p => p.id === Network.myId);
        UI.renderHand(Store.myHand, me ? me.colorIdx : 0, isMyTurn);
        
        UI.renderInGamePlayers(Store.players, Store.turnIndex);
        if (curPlayer) {
            UI.updateTurnInfo(curPlayer.nick, isMyTurn);
        }
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
    },

    // 内部帮助函数，获取卡牌中文名
    _getName(id) {
        const map = { skunk:'臭鼬', parrot:'鹦鹉', kanga:'袋鼠', monkey:'猴子', chame:'变色龙', seal:'海豹', zebra:'斑马', giraffe:'长颈鹿', snake:'蛇', croc:'河马', hippo:'鳄鱼', lion:'狮子' };
        return map[id] || id;
    }
};
