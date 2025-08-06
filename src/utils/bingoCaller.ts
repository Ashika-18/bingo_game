// bingoCaller.ts
// 型定義
export interface BingoCell {
    value: number | null;
    isMarked: boolean;
}

/**
 * プレイヤーのビンゴカード全体を表す型 (5x5の2次元配列)。
 */
export type PlayerBingoCard = BingoCell[][];

/**
 * 各プレイヤーの情報を表す型。
 */
export type Player = {
    id: string;
    card: PlayerBingoCard;
    isBingo: boolean;
    name: string;
}

// セッションごとの抽選状態を保持するマップ
// キーはセッションID (roomCode)、値はそのセッションの抽選状態
export type BingoSession = {
    numbers: number[];// 1~75までの数字の配列
    calledNumbers: number[];// 既に呼ばれた数字の配列
    availableNumbers: number[];// まだ呼ばれていない数字の配列
    players: Map<string, Player>;
    isGameStarted: boolean;
    isGameEnded: boolean;
    bingoWinnerId: string | null;
    gameMaster: string | null;
};

// --- セッションごとの抽選状態を保持するマップ ---
// キーはセッションID (roomCode)、値はそのセッションのBingoSessionオブジェクト
export const sessions = new Map<string, BingoSession>();

/**
 * 指定されたセッションIDのビンゴゲームの状態を初期化または取得します。
 * @param roomCode ゲームセッションの一意のID
 * @returns 初期化された、または既存のビンゴセッション
 */
export function initializeSession(roomCode: string): BingoSession {
    if (!sessions.has(roomCode)) {
        const initialNumbers = Array.from({ length: 75 }, (_, i) => i + 1);
        sessions.set(roomCode, {
            numbers: initialNumbers,
            calledNumbers: [],
            availableNumbers: [...initialNumbers],// 利用可能な数字は初期化時に全て
            players: new Map<string, Player>(),
            isGameStarted: false,
            isGameEnded: false,
            bingoWinnerId: null,
            gameMaster: null,
        });
        console.log(`Session initialized for room: ${roomCode}`);
    }
    return sessions.get(roomCode)!;// ! は null でないことをアサート
}

/**
 * 指定されたセッションから次のビンゴ数字を抽選します。
 * @param roomCode ゲームセッションの一意のID
 * @returns 抽選された数字、またはnull（全ての数字が呼ばれた場合）
 */
export function callNextBingoNumber(roomCode: string): { number: number, hasBingoWinner: boolean } | null {
    const session = sessions.get(roomCode);
    if (!session) {
        console.error(`Session ${roomCode} not found.`);
        return null;
    }
    if (session.availableNumbers.length === 0) {
        return null;// 全ての数字が呼ばれたら
    }
    let hasBingoWinner = false;// ビンゴ達成者がいるかどうかのフラグを追加

    const randomIndex = Math.floor(Math.random() * session.availableNumbers.length);
    const nextNumber = session.availableNumbers.splice(randomIndex, 1)[0];
    session.calledNumbers.push(nextNumber);

    console.log(`Called number ${nextNumber} for room ${roomCode}.Called numbers: ${session.calledNumbers.join(',')}`);

    // --- 各プレイヤーのカードを更新し、ビンゴ判定を行う ---
    session.players.forEach(player => {
        // プレイヤーのカードを更新(抽選された数字があればマークする)
        const wasMarked = markNumberOnPlayerCard(player.card, nextNumber);

        // カードが更新され、かつまだビンゴしていないプレイヤーの場合のみビンゴチェックを実行
        if (wasMarked && !player.isBingo) {
            if (checkBingo(player.card)) {
                player.isBingo = true;// ビンゴ状態をtrueに更新
                hasBingoWinner = true;
                console.log(`Player ${player.id} achieved BINGO in room ${roomCode}!`);
            }
        }
    });
    return { number: nextNumber, hasBingoWinner: hasBingoWinner };
}   

/**
 * 指定されたセッションの、現在抽選済みの全ての数字を取得します。
 * @param roomCode ゲームセッションの一意のID
 * @returns 抽選済みの数字の配列
 */
export function getCalledNumbers(roomCode: string): number[] {
    const session = sessions.get(roomCode);
    if (!session) {
        console.error(`Session ${roomCode} not found.`);
        return [];
    }
    return [...session.calledNumbers];// 配列のコピーを渡す
}

/**
 * 指定されたセッションのビンゴ抽選状態をリセットします。
 * @param roomCode ゲームセッションの一意のID
 */
export function resetBingoCaller(roomCode: string): void {
    const session = sessions.get(roomCode);
    if (session) {
        // セッションの状態を初期化
        const initialNumbers = Array.from({ length: 75}, (_, i) => i + 1);
        session.numbers = initialNumbers;
        session.calledNumbers = [];// 呼ばれた数字をクリア
        session.availableNumbers = [...initialNumbers];// 利用可能な数字をリセット
        session.isGameStarted = false;
        session.isGameEnded = false;
        session.bingoWinnerId = null;

        // 前プレイヤーのカードをリセット
        session.players.forEach(player => {
            // 新しいカードを生成
            const newCard = generateBingoCard();
            player.card = newCard;
            player.isBingo = false;// ビンゴ状態をリセット
        });

        console.log(`Bingo caller reset for room ${roomCode}.`);
    } else {
        console.warn(`Attempted to reset non-existent session: ${roomCode}`);
    }
}

/**
 * 新しいビンゴカードを生成します。（この関数はセッションとは独立して動作します）
 * @returns 2次元配列形式のビンゴカード
 */
export function generateBingoCard(): PlayerBingoCard {
    const card: PlayerBingoCard = Array(5).fill(null).map(() => Array(5).fill(null).map(() => ({ value: null, isMarked: false})));
    const ranges = {
        'B': { min: 1, max: 15 },
        'I': { min: 16, max: 30 },
        'N': { min: 31, max: 45 },
        'G': { min: 46, max: 60 },
        'O': { min: 61, max: 75 }
    };
    const letters = ['B', 'I', 'N', 'G', 'O'];

    letters.forEach((letter, colIndex) => {
        const range = ranges[letter as keyof typeof ranges];
        const numbersInColumn: number[] = [];
        while (numbersInColumn.length < 5) {
            const num = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
            if (!numbersInColumn.includes(num)) {
                numbersInColumn.push(num);
            }
        }
        numbersInColumn.sort((a, b) => a -b);// 配列内でソート

        for (let rowIndex = 0; rowIndex < 5; rowIndex++) {
            if (letter === 'N' && rowIndex === 2) {
                card[rowIndex][colIndex] = { value: null, isMarked: true };// freeスペース
            } else {
                card[rowIndex][colIndex] = { value: numbersInColumn.shift() || null, isMarked: false };
            }
        }
    });
    return card;
}

/*
 * プレイヤーを特定のビンゴセッションに追加します。
 * プレイヤーが既に存在する場合は、既存のカードを返します。
 * @param roomCode 参加するゲームセッションのID
 * @param playerId 追加するプレイヤーの一意のID (例: Socket.IOのソケットID)
 * @returns 生成または取得されたプレイヤーのビンゴカード
 */
export function addPlayerToSession(roomCode: string, playerId: string, playerName: string): PlayerBingoCard {
    const session = initializeSession(roomCode);// セッションが存在しなければ初期化

    if(!session.players.has(playerId)) {
        const newCard = generateBingoCard();// 新しいビンゴカードを生成
        session.players.set(playerId, { id: playerId, card: newCard, isBingo: false, name: playerName});
        console.log(`Player ${playerId} added to room ${roomCode}`);
        return newCard;
    }
    // すでにプレイヤーがいる場合は既存のカードを返す
    return session.players.get(playerId)!.card;
}

/**
 * プレイヤーを特定のビンゴセッションから削除します。
 * @param roomCode 削除元のゲームセッションのID
 * @param playerId 削除するプレイヤーの一意のID
 */
export function removePlayerFromSession(roomCode: string, playerId: string): void {
    const session = sessions.get(roomCode);
    if (session) {
        session.players.delete(playerId);
        console.log(`Player ${playerId} removed from room ${roomCode}`);
        // もしプレイヤーがいなくなったらセッションを削除する
        if(session.players.size === 0) {
            sessions.delete(roomCode);
            console.log(`Session ${roomCode} delete as all players left.`);
        }
    } else {
        console.warn(`Attempted to remove player ${playerId} from non-existent session: ${roomCode}`);
    }
}

/**
 * 指定されたビンゴカードに対してビンゴが成立しているかを判定します。
 * 縦、横、斜めのいずれかの列にマークされたセルが5つ揃っているかを確認します。
 * @param card 判定対象のビンゴカード
 * @returns ビンゴが成立していれば true、そうでなければ false
 */
export function checkBingo(card: PlayerBingoCard): boolean {
    const size = 5;// ビンゴカードのサイズは5*5

    // 1.横方向(Rows)のチェック
    for (let r = 0; r < size; r++) {
        let rowBingo = true;
        for (let c = 0; c < size; c++) {
            if (!card[r][c].isMarked) {
                rowBingo = false;
                break;// この行に未マークのセルがあれば、この行はビンゴではない
            }
        }
        if (rowBingo) return true;// この行がビンゴなら即座にtrueを返す
    }
    
    // 2. 縦方向(Columns)のチェック
    for (let c = 0; c < size; c++) {
        let colBingo = true;
        for (let r = 0; r < size; r++) {
            if (!card[r][c].isMarked) {
                colBingo = false;
                break;// この列に未マークのセルがあれば、この列はビンゴではない
            }
        }
        if (colBingo) return true;// この列がビンゴなら即座にtrueを返す
    }

    // 3.斜め方向(左上から右下: Top-Left to Bottom-Right)のチェック
    let diag1Bingo = true;
    for (let i = 0; i < size; i++) {
        if (!card[i][i].isMarked) {
            diag1Bingo = false;
            break;// この斜めに未マークのセルがあれば、斜めビンゴではない
        }
    }
    if (diag1Bingo) return true;// この斜めがビンゴなら即座にtrueを返す

    // 4.斜め方向(右上から左下: Top-Right to Bottom-Left)のチェック
    let diag2Bingo = true;
    for (let i = 0; i < size; i++) {
        if (!card[i][size - 1 - i].isMarked) {
            diag2Bingo = false;
            break;// この斜めに未マークのセルがあれば、斜めビンゴではない
        }
    }
    if (diag2Bingo) return true;// この斜めがビンゴなら即座にtrueを返す

    return false;// どのビンゴ条件も満たさなければfalseを返す
}

/**
 * 指定された数字がビンゴカード上にあればそのセルをマークします。
 * @param card プレイヤーのビンゴカード
 * @param drawnNumber 抽選された数字
 * @returns カードが更新され、マークされた場合は true、そうでなければ false
 */
export function markNumberOnPlayerCard(card: PlayerBingoCard, drawnNumber: number): boolean {
    let marked = false;
    for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
            // セルがフリースペースではなく (valueがnullでない)、かつ値が抽選数字と一致し、
            // さらにまだマークされていない場合
            if (card[r][c].value === drawnNumber && !card[r][c].isMarked) {
                card[r][c].isMarked = true;// セルをマーク済みに設定
                marked = true;
                return true;// 数字が見つかり、マークされたので処理を終了
            }
        }
    }
    return marked;// 数字が見つからず、マークされなかった場合(false)を返す
}