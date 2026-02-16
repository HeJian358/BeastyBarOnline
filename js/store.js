// js/store.js
export const Store = {
    // 玩家基础信息
    nicks: new Map(),        // ID -> 昵称
    playerStates: new Map(), // ID -> { isReady, isHost }
    
    // 游戏核心数据
    gameQueue: [],           // 当前排队的动物
    players: [],             // 游戏内的玩家列表 (带颜色、手牌数)
    turnIndex: 0,            // 当前回合索引
    
    // 我的数据
    myNick: "Player",
    myId: null,
    myHand: [],
    myDeck: [],
    
    // 状态标记
    isReady: false,
    amIHost: false,
    gameStarted: false,

    // 辅助方法：重置
    reset() {
        this.gameQueue = [];
        this.players = [];
        this.turnIndex = 0;
        this.gameStarted = false;
        this.isReady = false;
        // 注意：nicks 和 playerStates 通常不重置，除非断开连接
    }
};
