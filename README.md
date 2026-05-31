# Mussoorie Boys Trip — Live Budget & Orders

A GitHub Pages-ready static website for a boys trip to Mussoorie. It keeps all files in the main root folder with no subfolders.

## Features

- 7 friends already added by default
- Add/remove friends
- Change names and budgets
- Add shared expenses
- Choose who paid and who splits each expense
- Restaurant order board for stops
- Friends can add item names, quantity, and optional prices
- Admin can enter the final restaurant bill total
- Balances and settlement suggestions update automatically
- Local live sync between browser tabs
- Firebase Realtime Database support for true live syncing between friends
- No build step, no npm, no backend folder

## Files

```txt
index.html
styles.css
app.js
README.md
.nojekyll
```

## Run locally

Open `index.html` directly, or run a small local server:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploy on GitHub Pages

1. Create a new GitHub repository.
2. Upload these files directly into the repository root.
3. Go to **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select branch `main` and folder `/root`.
6. Save.

## Make realtime work between all friends

GitHub Pages is static, so true multi-device realtime needs a realtime database. This app already supports Firebase Realtime Database.

### Step 1: Create Firebase project

1. Go to Firebase Console.
2. Create a project.
3. Add a Web App.
4. Copy the Firebase config object.
5. Create a Realtime Database.

### Step 2: Paste config in `app.js`

In `app.js`, replace the empty values:

```js
const FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  databaseURL: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};
```

### Step 3: Database rules for a private friend group

For quick testing, Firebase may ask for database rules. A very simple temporary rule is:

```json
{
  "rules": {
    "trips": {
      "$tripId": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

Important: public read/write rules are okay only for quick testing. For a real private trip, use Firebase Authentication or stricter rules before sharing widely.

## Use separate rooms

Add a room name to the URL:

```txt
https://yourusername.github.io/yourrepo/?room=mussoorie-2026
```

Everyone using the same room link sees the same live trip data.

## Notes

- If item prices are added for all restaurant items, the final bill is split proportionally by item price.
- If item prices are missing, the final bill is split equally among friends who added items for that stop.
- Orders count in settlement just like expenses. The friend marked as “Paid by” gets credit for paying the bill.
