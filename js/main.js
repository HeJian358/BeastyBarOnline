import { Network } from './network.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { Store } from './store.js'; // 【重要】引入 Store

const handleGameData = (data) => {
    switch(data.type) {
        case 'SYS_USER_JOINED':
            UI.log(`🔗 玩家加入: ${data.peerId.substring(0,5)}`);
            // 更新 Store
            if (!Store.playerStates.has(data.peerId)) {
                Store.playerStates.set(data.peerId, { isReady: false, isHost: false });
            }
            
            // 发送我的状态给新人 (从 Store 读取)
            const conn = Network.connections.get(data.peerId);
            if (conn && conn.open) {
                conn.send({ 
                    type: 'SYNC_STATUS', 
                    nick: Store.myNick, 
                    id: Network.myId,
                    isReady: Store.isReady,
                    isHost: Store.amIHost
                });
            }
            UI.renderPlayerList(); // 参数不再需要传递，UI 会直接读 Store
            break;

        case 'SYNC_STATUS':
            // 写入 Store
            Store.nicks.set(data.id, data.nick);
            Store.playerStates.set(data.id, { isReady: data.isReady, isHost: data.isHost });
            UI.renderPlayerList();
            break;

        case 'PLAYER_READY':
            // 更新 Store
            const pState = Store.playerStates.get(data.id) || { isHost: false };
            pState.isReady = data.isReady;
            Store.playerStates.set(data.id, pState);
            UI.renderPlayerList();
            break;

        case 'GAME_INIT': 
            Game.onInit(data); 
            break;
            
        case 'GAME_MOVE': 
            Game.onMove(data); 
            break;
            
        case 'SYS_USER_LEFT':
            UI.log(`❌ 玩家断开`);
            Store.playerStates.delete(data.peerId);
            Store.nicks.delete(data.peerId);
            UI.renderPlayerList();
            break;
    }
};

// 1. 初始化用户
document.getElementById('btn-init-user').onclick = () => {
    const nick = document.getElementById('nickname').value.trim();
    if(!nick) return alert("请先输入昵称！");
    
    // 写入 Store
    Store.myNick = nick;
    
    const btn = document.getElementById('btn-init-user');
    btn.innerText = "连接中...";
    btn.disabled = true;

    Network.init(
        (id) => {
            UI.log(`✅ ID生成成功`);
            
            // 记录我的 ID 到 Store (方便调试)
            Store.myId = id;

            // 切换界面
            document.getElementById('conn-box').style.display = 'block';
            document.getElementById('target-id').placeholder = id; 
            document.getElementById('target-id').disabled = false;
            document.getElementById('btn-join').disabled = false;
            document.getElementById('btn-copy').style.display = 'inline-block';
            document.getElementById('my-status').innerText = `就绪 (${nick})`;
            
            btn.innerText = "已确认";
            document.getElementById('nickname').disabled = true;

            // 默认我是房主
            Store.amIHost = true;
            document.getElementById('btn-start').style.display = 'inline-block';
            
            UI.renderPlayerList();
        },
        handleGameData,
        (err) => {
            UI.log(`❌ 初始化失败: ${err.type}`);
            btn.innerText = "重试";
            btn.disabled = false;
        }
    );
};

// 2. 加入战局
document.getElementById('btn-join').onclick = () => {
    const target = document.getElementById('target-id').value.trim();
    if(!target) return alert("请输入房主ID");
    
    // 我加入别人，所以我不再是房主
    Store.amIHost = false;
    document.getElementById('btn-start').style.display = 'none';
    document.getElementById('btn-ready').style.display = 'inline-block';
    
    document.getElementById('btn-join').innerText = "连接中...";
    document.getElementById('btn-join').disabled = true; 

    Network.connect(target, handleGameData);
};

// 3. 准备 / 取消准备
document.getElementById('btn-ready').onclick = () => {
    Game.toggleReady();
    UI.renderPlayerList();
};

// 4. 房主开始游戏
document.getElementById('btn-start').onclick = () => {
    // 房主点击时，如果还没准备，先算作准备
    if (!Store.isReady) {
        Game.toggleReady();
        UI.renderPlayerList();
        return;
    }
    // 如果已经准备好了，才真正开始
    Game.hostStart();
};

// 5. 复制 ID
document.getElementById('btn-copy').onclick = () => {
    navigator.clipboard.writeText(document.getElementById('target-id').placeholder);
    UI.log("ID 已复制");
};

// 挂载到 window 方便调试
window.Game = Game; 
window.Store = Store;
console.log("Main.js (Store版) 加载成功");
