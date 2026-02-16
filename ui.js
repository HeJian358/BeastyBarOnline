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

    // 大厅玩家列表
    renderPlayerList: () => {
        const myId = Network.myId;
        const listEl = document.getElementById('player-status-list');
        let html = '';
        
        const allIds = [myId, ...Store.playerStates.keys()].filter(id => id !== myId);
        allIds.unshift(myId); 
        const uniqueIds = [...new Set(allIds)];

        uniqueIds.forEach(id => {
            // 【修改】从 Store 读取
            const nick = (id === myId) ? Store.myNick : (Store.nicks.get(id) || "连接中...");
            const state = Store.playerStates.get(id) || { isReady: false, isHost: false };
            
            if (id === myId) {
                state.isReady = Store.isReady;
                state.isHost = Store.amIHost;
            }

            const readyTag = state.isReady ? `<span class="tag ready">已就绪</span>` : `<span class="tag wait">等待中</span>`;
            const hostTag = state.isHost ? `<span class="tag host">房主</span>` : ``;

            html += `<li class="p-item"><span>${hostTag} ${nick} ${id === myId ? '(我)' : ''}</span>${readyTag}</li>`;
        });

        listEl.innerHTML = html;
        document.getElementById('p-count').innerText = uniqueIds.length;
        checkHostCanStart(uniqueIds);
    },

    // 【新增】游戏内玩家状态栏 (实时显示谁在思考)
    renderInGamePlayers: (players, turnIndex) => {
        const bar = document.getElementById('in-game-players');
        if (!bar) return;

        bar.innerHTML = players.map((p, idx) => {
            const isTurn = (idx === turnIndex);
            // 如果是他的回合，状态就是"选牌中/技能中"
            const statusText = isTurn ? "🤔 选牌中..." : "等待中";
            
            return `
                <div class="ig-player p-${p.colorIdx} ${isTurn ? 'active' : ''}">
                    <div class="ig-nick">${p.nick} ${p.id === Network.myId ? '(我)' : ''}</div>
                    <div class="ig-status">${statusText}</div>
                </div>
            `;
        }).join('');
    },

    renderQueue: (queue, players) => {
        const zone = document.getElementById('game-queue');
        zone.innerHTML = queue.map(c => {
            const owner = players.find(p => p.id === c.ownerId);
            const colorClass = owner ? `p-color-${owner.colorIdx}` : '';
            return `
                <div class="card ${colorClass}" style="width:60px; height:90px;">
                    <div style="font-size:1.2em; font-weight:bold;">${c.power}</div>
                    <div style="font-size:0.8em;">${c.id}</div>
                </div>
            `;
        }).join('');
    },

    renderHand: (hand, myColorIdx, isMyTurn) => {
        const zone = document.getElementById('my-hand');
        zone.innerHTML = hand.map(c => `
            <div class="card p-color-${myColorIdx}" 
                 style="${!isMyTurn ? 'opacity:0.6; cursor:not-allowed;' : ''}"
                 onclick="window.playCard('${c.uid}')">
                <div style="font-size:1.5em; font-weight:bold;">${c.power}</div>
                <div>${c.text}</div>
            </div>
        `).join('');
    },

    updateTurnInfo: (nick, isMe) => {
        const el = document.getElementById('turn-indicator');
        // 现在直接显示玩家昵称，不会再显示 Unknown
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
    
    // 【修复】补全了这里的逻辑
    if (!Store.isReady) { 
        btn.disabled = false; 
        btn.innerText = "✋ 房主请先准备"; 
        btn.style.background = "#f1c40f"; // 黄色
        btn.style.opacity = "1";
        return;
    }
    
    const isAllReady = allIds.every(id => {
        if (id === Network.myId) return Store.isReady;
        const s = Store.playerStates.get(id); 
        return s && s.isReady;
    });

    if (isAllReady && allIds.length >= 2) {
        btn.disabled = false; 
        btn.innerText = "🚀 开始游戏"; 
        btn.style.background = "#e74c3c"; // 红色
        btn.style.opacity = "1";
    } else {
        btn.disabled = true; 
        btn.innerText = `等待全员就绪 (${allIds.length < 2 ? '人数不足' : '有人未准备'})`; 
        btn.style.background = "#bdc3c7"; // 灰色
        btn.style.opacity = "0.6";
    }
}

window.playCard = (uid) => { if(Game && Game.playCard) Game.playCard(uid); };