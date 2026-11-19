# カニジャンプ 3D（three.js / PWA 版）

Flutter 版 `kani_jump-Chapter01` を元にした 3D ゲーム。横断歩道をわたるカニを操作して、奥から迫ってくる車をよける。

## 遊び方

| 操作 | スマホ | キーボード |
|---|---|---|
| ジャンプ | 画面下の「ジャンプ」ボタン／タップ／上スワイプ | スペース / ↑ / W |
| 横歩き（レーン移動） | 画面下の ◀ ▶ ボタン／左右スワイプ | ← → / A D |
| 一時停止 | 右上のボタン | P / Esc |

- 画面下のボタンは指が触れた瞬間に反応する。スタート前に 3・2・1 のカウントダウンがある（この間も横歩きはできる）
- 乗用車はジャンプで飛び越えられる。トラックは背が高いので横歩きでよける
- 車をよけると +1、飛び越えると +3、★を取ると +5
- 20 秒ごとにスピードが上がり、車の台数も増える
- BGM（タイトル曲・プレイ曲）と効果音は、右上のボタンで別々にオン・オフできる。プレイ曲はスピードに合わせてテンポが上がる

## 開発

```sh
npm install
npm run dev       # 開発サーバー（同じ Wi-Fi のスマホからも開ける）
npm run build     # dist/ に本番用ファイルを出力
npm run preview   # ビルド結果の確認（Service Worker も動く）
```

PWA としてホーム画面に追加するには HTTPS で公開する必要がある（localhost は例外）。`dist/` をそのまま GitHub Pages・Netlify・Vercel などに置けば動く（相対パスでビルドしているのでサブディレクトリでもよい）。

## 素材の作り方

### 3D モデル（Blender）

`blender/build_assets.py` がカニ・乗用車・トラック・★・街並みのステージを Python で組み立てて、`src/models/*.glb` に書き出す。

カニは Flutter 版の「カニ 1 号」（`art/reference_kani.png`）がモデル。毛糸のポンポンの体・動く目・白いフェルトの口・赤いフェルトのハサミと脚でできている。

- 毛糸のふわふわはゲーム側で描いている（`src/main.js` の `addPompomFur`。少しずつ大きい球を 20 枚重ねるファーシェル + はみ出した毛羽）
- 動く目の黒目は `PupilPosX` / `PupilNegX` を軸にした別部品で、ゲーム側で転がしている（`updateCrabDetails`）

```sh
npm run models    # blender -b -P blender/build_assets.py -- src/models
```

- カニのハサミは `ClawPosX` / `ClawNegX` という空オブジェクトを軸にしていて、ゲーム側で回転させている
- 車体色のマテリアル名は `Paint`。ゲーム側で 1 台ずつ色を変えている

### 2D 画像（Codex）

アイコン・空の背景・OGP 画像は Codex CLI の画像生成で作った。元画像は `art/*.png`。

```sh
./art/gen.sh icon "<プロンプト>"   # Codex で art/icon.png を作り直す
REF=art/reference_kani.png ./art/gen.sh crab_happy "<プロンプト>"   # 参考画像つき
npm run art                         # アイコン各サイズ・背景 JPEG を生成（Pillow が必要）
```

| 元画像 | 使い道 |
|---|---|
| `art/icon.png` | `public/icons/`（192 / 512 / マスカブル / apple-touch-icon / favicon） |
| `art/sky_day.png`・`art/sky_night.png` | `src/img/`（ライト / ダークモードの空） |
| `art/ogp.png` | `public/img/ogp.jpg`（SNS 共有用） |
| `art/crab_happy.png`・`art/crab_dizzy.png` | `src/img/*.webp`（タイトル・ゲームオーバーのイラスト） |

### フォント

見出しは Mochiy Pop One、本文は Zen Maru Gothic（どちらも Google Fonts・OFL）。画面で使う文字だけを抜き出したサブセットを `src/fonts/` に同梱しているので、オフラインでも表示が崩れない。**画面の文言を変えたら作り直す**こと。

```sh
npm run fonts     # index.html と src/*.js の文字を集めてサブセットを取得
```

## ファイル構成

```
index.html          画面（タイトル・HUD・一時停止・結果）
src/main.js         ゲーム本体（描画・当たり判定・出現パターン・操作）
src/audio.js        効果音と BGM（WebAudio で合成。曲は TRACKS に音名で書いてある）
src/style.css       見た目（ダークモード・モーション軽減に対応）
src/fonts/          サブセット化したフォント
src/img/            空の背景・カニのイラスト
vite.config.js      ビルドと PWA（manifest / Service Worker）の設定
blender/            3D モデルを作る Blender スクリプト
art/                Codex で作った元画像と変換スクリプト
```

開発サーバーではブラウザのコンソールから `window.__kani` でゲームの状態を見たり、`__kani.step(秒)` で早送りしたりできる（本番ビルドには含まれない）。
