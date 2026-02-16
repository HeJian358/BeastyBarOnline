import { Game } from './game.js';
import { Network } from './network.js';
import { Store } from './store.js';

export const UI = {
    log: (msg) => {
        const el = document.getElementById('sys-log');
        if(el) {
            el.innerHTML += `[${new Date().toLocaleTimeString()}] ${msg}<br>`;
            el.scrollTop = el.scrollHeight;
        }
    },

    startGameUI: () => {
        document.getElementById('setup-ui').style.display = 'none';
        document.getElementById('game-board').style.display = 'block';
    },

    renderPlayerList: () => {
        const myId = Network.myId;
        const listEl = document.getElementById('player-status-list');
        let html = '';
        const allIds = [myId, ...Store.playerStates.keys()].filter(id => id !== myId);
        allIds.unshift(myId); 
        const uniqueIds = [...new Set(allIds)];
        uniqueIds.forEach(id => {
            const nick = (id === myId) ? Store.myNick : (Store.nicks.get(id) || "连接中...");
            const state = Store.playerStates.get(id) || { isReady: false, isHost: false };
            if (id === myId) { state.isReady = Store.isReady; state.isHost = Store.amIHost; }
            const readyTag = state.isReady ? `<span class="tag ready">已就绪</span>` : `<span class="tag wait">等待中</span>`;
            const hostTag = state.isHost ? `<span class="tag host">房主</span>` : ``;
            html += `<li class="p-item"><span>${hostTag} ${nick} ${id === myId ? '(我)' : ''}</span>${readyTag}</li>`;
        });
        listEl.innerHTML = html;
        document.getElementById('p-count').innerText = uniqueIds.length;
        checkHostCanStart(uniqueIds);
    },

    renderInGamePlayers: (players, turnIndex) => {
        const bar = document.getElementById('in-game-players');
        if (!bar) return;
        bar.innerHTML = players.map((p, idx) => {
            const isTurn = (idx === turnIndex);
            const count = (p.id === Network.myId) ? Store.myHand.length : p.handCount;
            const statusText = isTurn ? "🤔 思考中..." : `剩余 ${count} 张`;
            return `<div class="ig-player p-${p.colorIdx} ${isTurn ? 'active' : ''}">
                    <div class="ig-nick">${p.nick} ${p.id === Network.myId ? '(我)' : ''}</div>
                    <div class="ig-status">${statusText}</div></div>`;
        }).join('');
    },

    // 【修改】队列现在支持点击了（为了鹦鹉技能）
    renderQueue: (queue, players) => {
        const zone = document.getElementById('game-queue');
        
        // 如果正在选鹦鹉目标，给队列加个特殊样式提示用户
        const isSelecting = (Game && Game.pendingCard);
        if (isSelecting) zone.style.border = "2px dashed red";
        else zone.style.border = "none";

        zone.innerHTML = queue.map(c => {
            const owner = players.find(p => p.id === c.ownerId);
            const colorClass = owner ? `p-color-${owner.colorIdx}` : 'p-color-0';
            
            // 如果正在选择模式，添加点击事件
            const clickAttr = isSelecting ? `onclick="window.onQueueClick('${c.uid}')" style="cursor:pointer; border: 2px solid red;"` : '';

            return `
                <div class="card ${colorClass}" style="width:60px; height:90px; margin-right:5px;" ${clickAttr}>
                    <div style="font-size:1.4em; font-weight:bold;">${c.power}</div>
                    <div style="font-size:0.7em;">${c.id}</div>
                </div>
            `;
        }).join('');
    },

    renderHand: (hand, myColorIdx, isMyTurn) => {
        const zone = document.getElementById('my-hand');
        
        // 如果正在选鹦鹉目标，手牌变灰，提示不能点
        if (Game && Game.pendingCard) {
            isMyTurn = false; 
        }

        const pointerStyle = isMyTurn ? 'cursor:pointer;' : 'cursor:not-allowed; opacity:0.6;';
        zone.innerHTML = hand.map(c => `
            <div class="card p-color-${myColorIdx}" 
                 style="${pointerStyle}"
                 onclick="${isMyTurn ? `window.playCard('${c.uid}')` : ''}">
                <div style="font-size:1.5em; font-weight:bold;">${c.power}</div>
                <div style="font-size:0.8em;">${c.text || c.id}</div>
            </div>
        `).join('');
    },

    updateTurnInfo: (nick, isMe) => {
        const el = document.getElementById('turn-indicator');
        el.innerText = isMe ? `🟢 轮到你了！请出牌` : `⏳ 轮到 ${nick} 出牌`;
        el.style.color = isMe ? '#27ae60' : '#333';
    },

    updateDeckInfo: (count) => {
        document.getElementById('deck-info').innerText = `牌库剩余: ${count}`;
    }
};

function checkHostCanStart(allIds) {
    if (!Store.amIHost) return;
    const btn = document.getElementById('btn-start');
    if (!Store.isReady) {
        btn.disabled = false; btn.innerText = "✋ 房主请先准备"; btn.style.background = "#f1c40f"; return;
    }
    const isAllReady = allIds.every(id => {
        if (id === Network.myId) return Store.isReady;
        const s = Store.playerStates.get(id); return s && s.isReady;
    });
    if (isAllReady && allIds.length >= 2) {
        btn.disabled = false; btn.innerText = "🚀 开始游戏"; btn.style.background = "#e74c3c";
    } else {
        btn.disabled = true; btn.innerText = "等待全员就绪"; btn.style.background = "#bdc3c7";
    }
}

window.playCard = (uid) => { if(Game && Game.playCard) Game.playCard(uid); };
// 【新增】鹦鹉选择目标的点击事件
window.onQueueClick = (uid) => { if(Game && Game.onQueueClick) Game.onQueueClick(uid); };
