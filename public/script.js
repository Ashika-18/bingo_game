// generateBingoCard 関数をインポートします
// このパスは、TypeScriptがJavaScriptにコンパイルされた後のファイルの場所を指します。
// tsconfig.json の outDir が './dist' であれば、相対パスは './../dist/utils/bingoCaller.js' となります。

const bingoCardElement = document.getElementById('bingo-card');
const generateCardButton = document.getElementById('generateCardButton');
const callNumberButton = document.getElementById('callNumberButton');
const currentNumberDisplay = document.getElementById('current-number');

// 現在のビンゴカードの状態を保持する変数
let currentBingoCard = [];

/**
 * ビンゴカードをHTMLにレンダリング（表示）する関数
 * @param {Array<Array<number | null>>} card - ビンゴカードのデータ
 */
function renderBingoCard(card) {
    bingoCardElement.innerHTML = '';// 既存のカードをクリア
    currentBingoCard = card;// 生成されたカードを保持

    // ヘッダー(B, I, N, G, O) を追加
    const headers = ['B', 'I', 'N', 'G', 'O'];
    headers.forEach(headerText => {
        const headerCell = document.createElement('div');
        headerCell.className = 'header-cell';
        headerCell.textContent = headerText;
        bingoCardElement.appendChild(headerCell);
    });

    // カードのマス（セル）をHTMLに追加
    // generateBingoCard関数は行と列を転置して返しているので、card[row][col] でアクセスできます
    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
            const cellValue = card[row][col];
            const cell = document.createElement('div');
            cell.className = 'bingo-cell';// 基本的なスタイルクラス

            // 各セルに一意のIDを設定 (マーク時に利用)
            // フリースペース (null) ではない場合にIDを振る
            if (cellValue !== null) {
                cell.id = `cell-${cellValue}`;
            }
            if (cellValue === null) {
                cell.textContent = 'FREE';
                cell.classList.add('free-space');// フリー数ペース用のスタイルを追加
            } else {
                cell.textContent = cellValue.toString();
            }
            bingoCardElement.appendChild(cell);// ビンゴカードの要素に追加
        }
    }
}

/**
 * ビンゴカード上の数字をマークする関数
 * @param {number} numberToMark - マークする数字
 */
function markNumberOnCard(numberToMark) {
    const cellToMark = document.getElementById(`cell-${numberToMark}`);
    if (cellToMark) {
        cellToMark.classList.add('marked');// 'marked'クラスを追加してスタイルを適用
    }
}

// --- イベントリスナーの設定 ---

// 「数字を引く」ボタンがクリックされた時の処理
callNumberButton.addEventListener('click', async () => {
    try {
        // サーバーの /api/bingo/call エンドポイントにリクエストを送信
        const response = await fetch('/api/bingo/call', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        });
        const data = await response.json();
        if (data.number !== null) {
            // 新しい数字が抽選された場合
            currentNumberDisplay.textContent = data.number;// 抽選された数字を画面に表示
            markNumberOnCard(data.number);// カード上の対応する数字をマーク

            // TODO: ここでビンゴ判定ロジックを呼び出す
        } else {
            // 全ての数字が抽選された場合(ゲーム終了)
            currentNumberDisplay.textCOntent = 'ゲーム終了!!';
            alert('全ての数字が抽選されました!');
            callNumberButton.disabled = true;// 「数字を引く」ボタンを無効化
        }
    } catch (error) {
        console.error('Error calling bingo number:', error);
        currentNumberDisplay.textContent = 'エラーが発生しました!';
    }
});

// 「新しいカードを生成」ボタンがクリックされた時の処理
generateCardButton.addEventListener('click', async () => {
    try {
        //サーバーの /api/bingo/card エンドポイントを呼び出して新しいカードを取得
        const response = await fetch('/api/bingo/card');
        const newCard = await response.json();
        renderBingoCard(newCard);// 取得したカードを表示

        // UIとサーバー側の状態をリセット
        callNumberButton.disabled = false;
        currentNumberDisplay.textContent = '__';
        await fetch('/api/bingo/reset', { method: 'POST' });
        console.log('サーバー側のビンゴ状態をリセットしました!');
    } catch (error) {
        console.error('新しいカードの生成に失敗しました!', error);
        alert('新しいカードの生成に失敗しました! サーバーが起動しているか確認してください!')
    }
});

// ページが完全に読み込まれた時に最初のカードを生成して表示
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/api/bingo/card');// サーバーからカードを取得
        const initialCard = await response.json();
        renderBingoCard(initialCard);
        console.log('読み込めてるよ!');
    } catch (error) {
        console.error('初期カードのロードに失敗しました!', error);
        alert('ビンゴカードのロードに失敗しました! サーバーが起動しているか確認してください!');
    }
});