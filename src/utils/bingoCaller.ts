// 抽選済みの数字を追跡するSet
const calledNumbers = new Set<number>();
// まだ抽選されていない数字のプール(1から75まで)
let availableNumbers: number[] = Array.from({ length: 75 }, (_, i) => i + 1);
 
/**
 * ビンゴの数字をランダムに1つ抽選します。
 * すでに抽選された数字は除外されます。
 * @returns 抽選された数字、または全ての数字が抽選された場合はnull
 */

export function callNextBingoNumber(): number | null {
    if (availableNumbers.length === 0) {
        // 全ての数字が抽選された場合
        return null;
    }
    // 残っている数字の中からランダムに1つ選ぶ
    const randomIndex = Math.floor(Math.random() * availableNumbers.length);
    const calledNumber = availableNumbers[randomIndex];

    // 選ばれた数字を利用可能な数字のプールから削除
    availableNumbers.splice(randomIndex, 1);
    // 抽選済みリストに追加
    calledNumbers.add(calledNumber);

    return calledNumber;
}

/**
 * 現在抽選済みの全ての数字のリストを返します。
 */
export function getCalledNumbers(): number[] {
    return Array.from(calledNumbers);
}

/**
 * 抽選の状態をリセットします。
 * (新しいゲームを開始する際などに使用)
 */
export function resetBingoCaller(): void {
    calledNumbers.clear();
    availableNumbers = Array.from({ length: 75 }, (_, i) => i + 1);
}

// ビンゴカードのマスを表す型
// 数値,またはフリースペースを示す null を許容
type BingoCell = number | null;

// ビンゴカード全体を表す型(5*5の2次元配列)
type BingoCard = BingoCell[][];

/**
 * ビンゴカードを生成します。
 * 各列は指定された範囲から重複しない数字を持ち,中央はフリースペースです。
 * @returns 生成された5*5のビンゴカード
 */
export function generateBingoCard(): BingoCard {
    const card: BingoCard = [];// 空のカードを初期化

    // 各列の数字の範囲を定義
    const columnRanges = [
        { min: 1, max: 15},  // B列
        { min: 16, max: 30}, // I列
        { min: 31, max: 45}, // N列
        { min: 46, max: 60}, // G列
        { min: 61, max: 75}  // O列
    ];

    // 5列すべてについて処理
    for (let col = 0; col < 5; col++) {
        const numbersInColumn: Set<number> = new Set();// その列で選ばれた数字を管理するSet
        const range = columnRanges[col];
        let numbersNeeded = 5;// 各列に必要な数字の数

        // N列の中央のフリースペースを考慮
        // N列 (col == 2) でかつ中央のマス (row == 2) はフリースペースになるため、必要な数字は4つ
        if (col == 2) {
            numbersNeeded = 4;
        }
        // 各列に必要な数の重複しない数字を選ぶ
        while (numbersInColumn.size < numbersNeeded) {
            // 範囲内の数字からランダムに1つ選ぶ
            const randomNumber = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
            numbersInColumn.add(randomNumber);// Setに追加することで重複を自動的に排除
        }
        // Setから配列に変換し、ソート(任意だが、カードが見やすくなる)
        const sortedColumnNumbers = Array.from(numbersInColumn).sort((a, b) => a - b);

        // カードの列に追加
        const currentColumn: BingoCell[] = [];
        for (let row = 0; row < 5; row++) {
            if (col === 2 && row === 2) {
                // N列(col=2) の中央 (row=2) はフリースペース
                currentColumn.push(null);// null でフリースペースを表現
            } else {
                currentColumn.push(sortedColumnNumbers.shift() as number);// 先頭から数字を取り出して追加   
            }
        }
        card.push(currentColumn);// 完成した列をカードに追加
    }
    //列ごとに生成したので,行と列を入れ替える(ビンゴカードは通常、行ベースでアクセスするため)
    const transposedCard: BingoCard = [];
    for (let row = 0; row < 5; row++) {
        const newRow: BingoCell[] = [];
        for (let col = 0; col < 5; col++) {
            newRow.push(card[col][row]);
        }
        transposedCard.push(newRow);
    }
    return transposedCard;
}
