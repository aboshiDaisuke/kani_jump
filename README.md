# カニジャンプ コレクション

手芸ポンポンの「カニ1号」が活躍する2つの Web ゲームを 1 つにまとめたフォルダです。

## フォルダ構成

```text
kani_jump/
├── index.html          # 2D DX / 3D を選べるトップポータル
├── portal-assets/      # ポータル用アイコン・サムネイル
├── 2d/                 # カニジャンプ DX（2D 横スクロールジャンプアクション）
├── 3d/                 # カニジャンプ 3D（Three.js 3レーンランナー / PWA）
├── dist/               # そのまま公開・配信できる統合ビルド一式（ポータル＋2D＋3D）
└── scripts/
    ├── build-all.mjs   # 2D・3D をまとめてビルドして dist/ に統合
    └── serve.mjs       # dist/ をローカル＆同一 Wi-Fi のスマホ向けに配信
```

## 遊び方（ローカル起動）

このフォルダ（`kani_jump`）で次を実行します。

```sh
npm start
```

ブラウザで `http://localhost:8080/` を開くと、**カニジャンプ DX（2D）** と **カニジャンプ 3D** の両方を選んで遊べます。

## 開発・ビルドコマンド

```sh
npm run build   # 2D・3D の両方を再ビルドし、dist/ を最新化
npm test        # 2D 版のロジック単体テストを実行
npm run dev:2d  # 2D 版の開発サーバー（ホットリロード）
npm run dev:3d  # 3D 版の開発サーバー（ホットリロード）
```

> `dist/` フォルダをそのまま GitHub Pages・Netlify・Vercel 等にアップロードすれば、ポータルごと公開できます。
