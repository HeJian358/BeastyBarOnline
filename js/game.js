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
        this.pendingCard = null; // 重置状态
        
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

    // 1. 玩家点击手牌
    playCard(cardUid) {
        const curPlayer = Store.players[Store.turnIndex];
        if (curPlayer.id !== Network.myId) return UI.log("⚠️ 还没轮到你！");

        // 如果之前正在等待选鹦鹉的目标，先取消（防止卡死）
        if (this.pendingCard) {
            this.pendingCard = null;
            UI.log("已取消选择。");
            this.updateBoard();
            return;
        }

        const card = Store.myHand.find(c => c.uid === cardUid);
        if (!card) return;

        // --- 特殊卡牌逻辑分支 ---

        // 🦜 鹦鹉：需要选择目标
        if (card.id === 'parrot' && Store.gameQueue.length > 0) {
            this.pendingCard = card;
            UI.log("🦜 请点击队列中的一只动物将其踢出！");
            UI.renderHand(Store.myHand, Store.players.find(p=>p.id===Network.myId).colorIdx, true); // 刷新UI高亮
            return; 
        }

        // 🦘 袋鼠：需要输入跳几步
        if (card.id === 'kanga') {
            // 简单处理：用浏览器自带弹窗询问 (后续可改为漂亮UI)
            let jump = prompt("🦘 袋鼠技能：请输入 1 跳过一只，或 2 跳过两只", "1");
            if (jump !== "1" && jump !== "2") return; // 取消出牌
            this.broadcastMove(card, { jump: parseInt(jump) });
            return;
        }

        // 🦨 臭鼬 & 其他：直接出牌
        this.broadcastMove(card, {});
    },

    // 1.5 鹦鹉专属：点击队列触发
    onQueueClick(targetUid) {
        if (!this.pendingCard) return;
        
        // 只能点队列里的
        const targetExists = Store.gameQueue.find(c => c.uid === targetUid);
        if (!targetExists) return;

        // 发送出牌指令 (带上 targetUid)
        this.broadcastMove(this.pendingCard, { targetUid: targetUid });
        this.pendingCard = null; // 清除状态
    },

    // 2. 广播出牌动作
    broadcastMove(card, extraData) {
        Network.broadcast({
            type: 'GAME_MOVE',
            cardUid: card.uid,
            cardId: card.id,
            power: card.power,
            ownerId: Network.myId,
            extra: extraData // 携带技能参数(jump/targetUid)
        });
        
        // 本地立刻执行
        this.handleLocalMove(card);
    },

    handleLocalMove(card) {
        const idx = Store.myHand.findIndex(c => c.uid === card.uid);
        if (idx > -1) Store.myHand.splice(idx, 1);
        if (Store.myDeck.length > 0) Store.myHand.push(Store.myDeck.pop());
    },

    // 3. 收到网络包，处理所有逻辑 (入场 -> 技能 -> 门禁)
    onMove(data) {
        // 更新手牌数显示
        if (data.ownerId !== Network.myId) {
            const p = Store.players.find(p => p.id === data.ownerId);
            if (p) {
                p.handCount--;
                UI.log(`🃏 ${p.nick} 打出了 [${data.power}] ${getCardName(data.cardId)}`);
            }
        }

        // --- A. 动物入场 ---
        const newCard = {
            uid: data.cardUid, id: data.cardId, power: data.power, ownerId: data.ownerId
        };
        Store.gameQueue.push(newCard); // 默认排队尾

        // --- B. 触发技能 ---
        this.applySkill(newCard, data.extra);

        // --- C. 检查门禁 ---
        this.checkGate();

        // --- D. 切换回合 ---
        this.nextTurn();
        this.updateBoard();
    },

    // 🦁 核心技能逻辑 🦁
    applySkill(card, extra) {
        const queue = Store.gameQueue;
        
        // 1. 🦨 臭鼬：淘汰数字最大的 (除了臭鼬自己)
        if (card.id === 'skunk') {
            // 找最大值 (排除所有臭鼬 power=1)
            let maxVal = -1;
            queue.forEach(c => {
                if (c.id !== 'skunk' && c.power > maxVal) maxVal = c.power;
            });

            if (maxVal > 0) {
                const victims = queue.filter(c => c.power === maxVal && c.id !== 'skunk');
                // 从队列移除
                Store.gameQueue = queue.filter(c => c.power !== maxVal || c.id === 'skunk');
                if (victims.length > 0) UI.log(`💨 臭鼬熏走了: ${victims.map(v=>v.power).join(',')}`);
            }
        }

        // 2. 🦜 鹦鹉：淘汰指定的动物
        else if (card.id === 'parrot' && extra && extra.targetUid) {
            const victimIdx = queue.findIndex(c => c.uid === extra.targetUid);
            if (victimIdx !== -1) {
                const v = queue[victimIdx];
                queue.splice(victimIdx, 1);
                UI.log(`🦜 鹦鹉骂跑了 [${v.power}]`);
            }
        }

        // 3. 🦘 袋鼠：跳过1或2个
        else if (card.id === 'kanga' && extra && extra.jump) {
            // 袋鼠现在在队尾 (index = length-1)
            const jump = extra.jump; // 1 或 2
            const kangaIdx = queue.length - 1;
            let targetIdx = kangaIdx - jump;
            if (targetIdx < 0) targetIdx = 0; // 最多跳到第一位
            
            // 移动数组元素
            if (targetIdx < kangaIdx) {
                const kanga = queue.pop(); // 拿出来
                queue.splice(targetIdx, 0, kanga); // 插进去
                UI.log(`🦘 袋鼠跳过了 ${jump} 个位置`);
            }
        }
    },

    // 🚪 门禁逻辑：满5结算
    checkGate() {
        if (Store.gameQueue.length === 5) {
            UI.log("🚪 门口满了！开始结算...");
            
            const toBar = Store.gameQueue.slice(0, 2); // 前2个
            const remain = Store.gameQueue.slice(2, 4); // 中间2个留着
            const toTrash = Store.gameQueue.slice(4, 5); // 最后1个踢掉

            // 简单的动画效果（日志代替）
            toBar.forEach(c => UI.log(`🍻 [${c.power}] 进入了酒吧！`));
            toTrash.forEach(c => UI.log(`🗑️ [${c.power}] 被踢进了垃圾桶！`));

            Store.gameQueue = remain; // 更新队列
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
