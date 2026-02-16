import { createDeck } from './cardData.js';
import { Network } from './network.js';
import { UI } from './ui.js';
import { Store } from './store.js';

export const Game = {
    // 临时存储待打出的牌（用于鹦鹉选目标）
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

    // 1. 玩家点击手牌 (入口)
    playCard(cardUid) {
        const curPlayer = Store.players[Store.turnIndex];
        if (curPlayer.id !== Network.myId) return UI.log("⚠️ 还没轮到你！");

        if (this.pendingCard) {
            this.pendingCard = null;
            UI.log("已取消选择。");
            this.updateBoard();
            return;
        }

        const card = Store.myHand.find(c => c.uid === cardUid);
        if (!card) return;

        // --- 特殊技能交互 ---
        if (card.id === 'parrot' && Store.gameQueue.length > 0) {
            this.pendingCard = card;
            UI.log("🦜 鹦鹉技能：请点击队列中的一只动物将其踢出！");
            UI.renderHand(Store.myHand, Store.players.find(p=>p.id===Network.myId).colorIdx, true);
            return; 
        }

        if (card.id === 'kanga') {
            let jump = prompt("🦘 袋鼠技能：请输入 1 跳过一只，或 2 跳过两只", "1");
            if (jump !== "1" && jump !== "2") return; 
            this.executeMove(card, { jump: parseInt(jump) });
            return;
        }

        // 普通出牌
        this.executeMove(card, {});
    },

    // 1.5 鹦鹉选择目标后触发
    onQueueClick(targetUid) {
        if (!this.pendingCard) return;
        const targetExists = Store.gameQueue.find(c => c.uid === targetUid);
        if (!targetExists) return;

        this.executeMove(this.pendingCard, { targetUid: targetUid });
        this.pendingCard = null;
    },

    // 2. 执行并广播 (构造数据包)
    executeMove(card, extraData) {
        const moveData = {
            type: 'GAME_MOVE',
            cardUid: card.uid,
            cardId: card.id,
            power: card.power,
            ownerId: Network.myId,
            extra: extraData || {}
        };

        // A. 告诉别人
        Network.broadcast(moveData);

        // B. 自己立刻执行 (重点！走同一套逻辑)
        this.processMove(moveData);
    },

    // 3. 收到网络消息
    onMove(data) {
        // 如果收到的是自己的包，忽略（因为步骤2里已经执行过了，避免重复）
        if (data.ownerId === Network.myId) return;
        
        this.processMove(data);
    },

    // 4. 【核心】统一处理逻辑 (无论是谁出的牌，都走这里)
    processMove(data) {
        // --- 4.1 处理手牌与补牌 ---
        if (data.ownerId === Network.myId) {
            // 如果是我出的：从手里删掉，从牌库摸一张
            const idx = Store.myHand.findIndex(c => c.uid === data.cardUid);
            if (idx > -1) Store.myHand.splice(idx, 1);
            if (Store.myDeck.length > 0) Store.myHand.push(Store.myDeck.pop());
        } else {
            // 如果是别人出的：
            const p = Store.players.find(p => p.id === data.ownerId);
            if (p) {
                // 【修复】不减手牌数！因为规则是出一补一，始终是4张
                // 除非未来实现了牌库耗尽逻辑，目前暂时保持不变
                UI.log(`🃏 ${p.nick} 打出了 [${data.power}] ${getCardName(data.cardId)}`);
            }
        }

        // --- 4.2 动物入场 ---
        // 【修复】之前这里漏了把牌加入队列
        const newCard = {
            uid: data.cardUid, 
            id: data.cardId, 
            power: data.power, 
            ownerId: data.ownerId
        };
        Store.gameQueue.push(newCard); // 先加入队尾

        // --- 4.3 触发技能 ---
        this.applySkill(newCard, data.extra);

        // --- 4.4 检查门禁 ---
        this.checkGate();

        // --- 4.5 切换回合 & 刷新 ---
        this.nextTurn();
        this.updateBoard();
    },

    // 🦁 技能实现 🦁
    applySkill(card, extra) {
        let queue = Store.gameQueue;
        
        // 1. 🦨 臭鼬：淘汰最大 (非臭鼬)
        if (card.id === 'skunk') {
            let maxVal = -1;
            // 找最大值
            queue.forEach(c => {
                if (c.id !== 'skunk' && c.power > maxVal) maxVal = c.power;
            });
            // 只有当最大值大于臭鼬(1)时才生效 (防止场上只有臭鼬自己)
            if (maxVal > 1) {
                // 筛选出要留下的：(不是最大值) 或者 (是最大值但是只臭鼬)
                const keep = queue.filter(c => c.power !== maxVal || c.id === 'skunk');
                const kicked = queue.filter(c => c.power === maxVal && c.id !== 'skunk');
                
                Store.gameQueue = keep;
                if (kicked.length > 0) UI.log(`💨 臭鼬熏走了: ${kicked.map(v=>v.power).join(',')}`);
            }
        }

        // 2. 🦜 鹦鹉：指定淘汰
        else if (card.id === 'parrot' && extra && extra.targetUid) {
            const idx = queue.findIndex(c => c.uid === extra.targetUid);
            if (idx !== -1) {
                const v = queue[idx];
                queue.splice(idx, 1);
                UI.log(`🦜 鹦鹉骂跑了 [${v.power}] ${getCardName(v.id)}`);
            }
        }

        // 3. 🦘 袋鼠：插队
        else if (card.id === 'kanga' && extra && extra.jump) {
            // 刚入场的袋鼠肯定在最后
            const kangaIdx = queue.length - 1;
            // 计算目标位置
            let targetIdx = kangaIdx - extra.jump;
            if (targetIdx < 0) targetIdx = 0;
            
            if (targetIdx < kangaIdx) {
                const kanga = queue.pop(); // 取出
                queue.splice(targetIdx, 0, kanga); // 插入
                UI.log(`🦘 袋鼠往前跳了 ${extra.jump} 步`);
            }
        }
    },

    // 🚪 门禁：满5结算
    checkGate() {
        if (Store.gameQueue.length === 5) {
            UI.log("🚪 门口满了(5人)，开始结算！");
            
            const toBar = Store.gameQueue.slice(0, 2);   // 前2进酒吧
            const remain = Store.gameQueue.slice(2, 4);  // 中2留守
            const toTrash = Store.gameQueue.slice(4, 5); // 尾1踢掉

            toBar.forEach(c => UI.log(`🍻 [${c.power}] ${getCardName(c.id)} 进酒吧了！`));
            toTrash.forEach(c => UI.log(`🗑️ [${c.power}] ${getCardName(c.id)} 被踢掉了！`));

            Store.gameQueue = remain; 
        }
    },

    nextTurn() {
        Store.turnIndex = (Store.turnIndex + 1) % Store.players.length;
    },

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

function getCardName(id) {
    const map = { skunk:'臭鼬', parrot:'鹦鹉', kanga:'袋鼠', monkey:'猴子', chame:'变色龙', seal:'海豹', zebra:'斑马', giraffe:'长颈鹿', snake:'蛇', croc:'河马', hippo:'鳄鱼', lion:'狮子' };
    return map[id] || id;
}
