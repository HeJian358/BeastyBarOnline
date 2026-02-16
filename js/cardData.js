export const CARD_TYPES = {
    skunk:  { id: 'skunk',  power: 1,  text: "臭鼬" },
    parrot: { id: 'parrot', power: 2,  text: "鹦鹉" },
    kanga:  { id: 'kanga',  power: 3,  text: "袋鼠" },
    monkey: { id: 'monkey', power: 4,  text: "猴子" },
    chame:  { id: 'chame',  power: 5,  text: "变色龙" },
    seal:   { id: 'seal',   power: 6,  text: "海豹" },
    zebra:  { id: 'zebra',  power: 7,  text: "斑马" },
    giraffe:{ id: 'giraffe',power: 8,  text: "长颈鹿" },
    snake:  { id: 'snake',  power: 9,  text: "蛇" },
    hippo:   { id: 'croc',   power: 10, text: "河马" },
    croc:  { id: 'hippo',  power: 11, text: "鳄鱼" },
    lion:   { id: 'lion',   power: 12, text: "狮子" }
};

export function createDeck(deckId) {
    const deck = [];
    // 每个动物各一张，共12张
    Object.values(CARD_TYPES).forEach(type => {
        deck.push({
            uid: `${deckId}-${type.id}-${Math.random().toString(36).substr(2, 5)}`,
            id: type.id,
            power: type.power,
            text: type.text
        });
    });
    return deck;
}
