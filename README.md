# 自社メディア進捗トラッカー

note / Medium / Ronin Pop / みうらくんと管理人 の投稿進捗を管理する Web アプリ。

## 公開URL

**https://takpz93.github.io/cmo-media-tracker/**

リポジトリ: [github.com/takpz93/cmo-media-tracker](https://github.com/takpz93/cmo-media-tracker)

デプロイ: `bash scripts/deploy.sh`

## 週次リズム

| 曜日 | メディア |
|------|---------|
| 月 | note |
| 火 | Medium |
| 水 | Ronin Pop |
| 木 | note |
| 金 | Medium ＋ **みうらくんと管理人** |

**完成ルール：** 全メディア、公開の **1週間前** に投稿完了状態

## 起動（ローカル）

**推奨（空いているポートを自動選択してブラウザを開く）:**

```bash
bash CMO/media-tracker/scripts/serve.sh
```

または:

```bash
cd "CMO/media-tracker"
bash scripts/serve.sh
```

手動の場合:

```bash
cd "CMO/media-tracker"
python3 -m http.server 8080
# http://localhost:8080
```

`index.html` を直接開く（`file://`）場合も最低限動きますが、**🔄 更新** で全データを読むにはローカルサーバーが必要です。

## 主な機能

| タブ | 内容 |
|------|------|
| **今週** | 今週の投稿枠・KPI・ステータス |
| **アラート** | 期限超過・英訳待ち・制作中の優先リスト |
| **月間** | カレンダー表示 |
| **一覧** | 全枠テーブル |
| **概要** | 媒体別サマリー |

- カードタップでステータス・トピック・進捗%を編集
- `localStorage` 自動保存
- **📥 保存** で JSON エクスポート → `data/schedule.json` に配置して共有
- **🔄 更新** でサーバー JSON を取得

## データ

- 正本（エージェント用）: `CMO/schedule/schedule.json`
- アプリ用: `CMO/media-tracker/data/schedule.json`

エクスポートした JSON は `CMO/schedule/schedule.json` にも反映すると `cmo-schedule-manager` と同期できます。

## ファイル構成

```
media-tracker/
├── index.html
├── styles.css
├── app.js
├── data/schedule.json
└── README.md
```

## 関連

- CMO運用マネージャー: `.cursor/skills/cmo-media-manager/SKILL.md`
- メディア定義: `CMO/agents/media-registry.md`
