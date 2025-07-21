"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeSession = initializeSession;
exports.callNextBingoNumber = callNextBingoNumber;
exports.getCalledNumbers = getCalledNumbers;
exports.resetBingoCaller = resetBingoCaller;
exports.generateBingoCard = generateBingoCard;
const sessions = new Map();
/**
 * 指定されたセッションIDのビンゴゲームの状態を初期化または取得します。
 * @param roomCode ゲームセッションの一意のID
 * @returns 初期化された、または既存のビンゴセッション
 */
function initializeSession(roomCode) {
    if (!sessions.has(roomCode)) {
        const initialNumbers = Array.from({ length: 75 }, (_, i) => i + 1);
        sessions.set(roomCode, {
            numbers: initialNumbers,
            calledNumbers: [],
            availableNumbers: [...initialNumbers] // 利用可能な数字は初期化時に全て
        });
        console.log(`Session initialized for room: ${roomCode}`);
    }
    return sessions.get(roomCode); // ! は null でないことをアサート
}
/**
 * 指定されたセッションから次のビンゴ数字を抽選します。
 * @param roomCode ゲームセッションの一意のID
 * @returns 抽選された数字、またはnull（全ての数字が呼ばれた場合）
 */
function callNextBingoNumber(roomCode) {
    const session = sessions.get(roomCode);
    if (!session) {
        console.error(`Session ${roomCode} not found.`);
        return null;
    }
    if (session.availableNumbers.length === 0) {
        return null; // 全ての数字が呼ばれたら
    }
    const randomIndex = Math.floor(Math.random() * session.availableNumbers.length);
    const nextNumber = session.availableNumbers.splice(randomIndex, 1)[0];
    session.calledNumbers.push(nextNumber);
    console.log(`Called number ${nextNumber} for room ${roomCode}.Called numbers: ${session.calledNumbers.join(',')}`);
    return nextNumber;
}
/**
 * 指定されたセッションの、現在抽選済みの全ての数字を取得します。
 * @param roomCode ゲームセッションの一意のID
 * @returns 抽選済みの数字の配列
 */
function getCalledNumbers(roomCode) {
    const session = sessions.get(roomCode);
    if (!session) {
        console.error(`Session ${roomCode} not found.`);
        return [];
    }
    return [...session.calledNumbers]; // 配列のコピーを渡す
}
/**
 * 指定されたセッションのビンゴ抽選状態をリセットします。
 * @param roomCode ゲームセッションの一意のID
 */
function resetBingoCaller(roomCode) {
    if (sessions.has(roomCode)) {
        initializeSession(roomCode); // セッションを再初期化
        console.log(`Bingo caller reset for room ${roomCode}.`);
    }
    else {
        console.warn(`Attempted to reset non-existent session: ${roomCode}`);
    }
}
/**
 * 新しいビンゴカードを生成します。（この関数はセッションとは独立して動作します）
 * @returns 2次元配列形式のビンゴカード
 */
function generateBingoCard() {
    const card = Array(5).fill(null).map(() => Array(5).fill(null));
    const ranges = {
        'B': { min: 1, max: 15 },
        'I': { min: 16, max: 30 },
        'N': { min: 31, max: 45 },
        'G': { min: 46, max: 60 },
        'O': { min: 61, max: 75 }
    };
    const letters = ['B', 'I', 'N', 'G', 'O'];
    letters.forEach((letter, colIndex) => {
        const range = ranges[letter];
        const numbersInColumn = [];
        while (numbersInColumn.length < 5) {
            const num = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
            if (!numbersInColumn.includes(num)) {
                numbersInColumn.push(num);
            }
        }
        numbersInColumn.sort((a, b) => a - b); // 配列内でソート
        for (let rowIndex = 0; rowIndex < 5; rowIndex++) {
            if (letter === 'N' && rowIndex === 2) {
                card[rowIndex][colIndex] = null; // freeスペース
            }
            else {
                card[rowIndex][colIndex] = numbersInColumn.shift() || null;
            }
        }
    });
    return card;
}
