# 京都冬日手帖 — Firebase 設定完成版部署說明

## 本次已完成
- 已將 `kyoto-trip-80462` 的 Firebase Web App 設定放進 `index.html`。
- 使用 Firebase Auth Google 登入、Cloud Firestore `/trips/{uid}` 存取個人行程。網站不需要 Analytics，所以沒有載入 Analytics SDK。
- 私人旅行資料不會寫進 GitHub 公開的 `index.html`，且「下載可部署 HTML」不包含私人行程。
- 已確認網站腳本語法、10 天日期列與下載公開 HTML 的功能；**尚未驗證真實 Google 登入及 Firestore 讀寫**。

## 請依序完成的 Firebase 控制台設定

1. 開啟 [Firebase Console](https://console.firebase.google.com/) → 專案 `kyoto-trip-80462`。
2. **Authentication → Sign-in method → Google**：啟用 Google 並設定支援電子郵件（如介面要求）。
3. **Authentication → Settings → Authorized domains**：加入你實際的 GitHub Pages 網域（如 `yourname.github.io`）；不要加 `https://`、不要加 `/kyoto-trip`。若使用自訂網域，也需新增該網域。
4. **Firestore Database → Create database**：建立 Standard / Native 模式資料庫（若尚未建立），選定所在區域。
5. **Firestore Database → Rules**：完整貼入同時提供的 `firestore.rules`，再按 **Publish**。務必不要使用 `allow read, write: if true;`。

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /trips/{userId} {
      allow read, write: if request.auth != null
                         && request.auth.uid == userId;
    }
  }
}
```

## 上傳 GitHub Pages

1. 在 GitHub 新建或開啟你的 repository（例如 `kyoto-trip`）。
2. 上傳這次提供的 **`index.html`** 至 repository 根目錄，commit。
3. Repository **Settings → Pages → Build and deployment**：Source 設為 `Deploy from a branch`，選 `main` / `(root)`，Save。
4. 開啟 GitHub Pages 網址 `https://你的帳號.github.io/kyoto-trip/`。
5. 點「雲端同步工作室 → 使用 Google 登入」，確認顯示「雲端已同步」。編輯一筆待辦，再從手機／電腦用相同 Google 帳號登入驗證是否同步。

## 注意事項

- `firebaseConfig`、`apiKey` 是 Firebase Web App 的專案設定，不等於服務帳號私鑰，可放在公開的前端網頁。**請勿上傳 service account JSON、private key 或登入憑證**。
- Firestore Rules 才是資料存取權限的核心：每個已登入的 Google 帳號只能存取其 UID 對應的 `trips` 文件。**這不是只准你一人登入的白名單模式**；其他 Google 帳號可登入，但不能讀取你的私人行程。
- 初次登入若出現 `auth/unauthorized-domain`，通常是 GitHub Pages 網域還沒加進 Authorized domains。
- 若出現 `permission-denied`，通常是尚未啟用 Firestore，或 Rules 未正確 Publish。
- 若出現 Google 登入視窗遭封鎖，請允許彈出式視窗。這版使用 `signInWithPopup()`，而不是 Redirect。
- 變更會先保存在本機並嘗試同步；**請以「雲端已同步」狀態為準**。未同步的內容不保證換裝置後存在。
- 單一 Firestore 文件適合此旅行規模；若未來增加大量相片等資料，宜改為多文件架構與 Storage。
- 強烈建議定期匯出 JSON 私人備份，**不要把含訂房與個資的 JSON 上傳公開 GitHub**。
- Firebase SDK 與 Google Fonts 需連網載入，純離線直接開啟 HTML 無法完成 Google 登入。
