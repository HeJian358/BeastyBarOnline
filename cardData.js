export const ANIMAL_SETS = {
    'set1': [
        { id: 'Lion', power: 12, text: "狮子" },
        { id: 'Hippo', power: 11, text: "鳄鱼" },
        { id: 'Croc', power: 10, text: "河马" },
        { id: 'Snake', power: 9, text: "蛇" },
        { id: 'Giraffe', power: 8, text: "长颈鹿" },
        { id: 'Zebra', power: 7, text: "斑马" },
        { id: 'Seal', power: 6, text: "海豹" },
        { id: 'Chameleon', power: 5, text: "变色龙" },
        { id: 'Monkey', power: 4, text: "猴子" },
        { id: 'Kangaroo', power: 3, text: "袋鼠" },
        { id: 'Parrot', power: 2, text: "鹦鹉" },
        { id: 'Skunk', power: 1, text: "臭鼬" }
    ]
};

// 生成一套牌 (给每张牌加唯一ID)
export function createDeck(setId) {
    return ANIMAL_SETS[setId].map(a => ({
        ...a,
        uid: Math.random().toString(36).substr(2, 9)
    }));
}