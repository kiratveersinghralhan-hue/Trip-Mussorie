# Mussoorie Boys Trip — Premium Realtime Website

Root-only GitHub Pages website for a shared boys trip dashboard.

## Files

```txt
index.html
styles.css
app.js
README.md
.nojekyll
```

No folders, no build step, no npm install.

## What it does

- Premium mobile-first trip dashboard
- Realtime Firebase sync using one trip code
- 7 friends by default
- Add, remove and rename friends
- Edit each friend's budget
- Add expenses with optional bill photo
- Restaurant order board where friends add item names
- Enter final restaurant total and see approx split
- Upload bill photos from phone camera/gallery
- Export JSON backup
- No "who pays whom" or settlement section

## Deploy on GitHub Pages

1. Create a new GitHub repository.
2. Upload these files directly in the main/root folder.
3. Go to **Settings → Pages**.
4. Choose branch **main** and folder **root**.
5. Open the GitHub Pages link.
6. Copy the friend link from the app and send it to your group.

## Firebase setup needed

Your Firebase config is already pasted inside `app.js`.

You still need to enable these in Firebase Console:

### 1. Cloud Firestore

Firebase Console → Build → Firestore Database → Create database.

For quick testing, you can use these open rules:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /trips/{tripId} {
      allow read, write: if true;
    }
  }
}
```

### 2. Firebase Storage

Firebase Console → Build → Storage → Get started.

For quick testing, use these open rules:

```js
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /trip-bills/{tripId}/{allPaths=**} {
      allow read, write: if true;
    }
  }
}
```

## Important privacy note

The quick rules above make the trip editable by anyone with the link/trip code. This is easiest for friends, but do not use it for private or sensitive information.

## How friends join

Everyone should open the same URL with the same trip code, like:

```txt
https://yourusername.github.io/repo-name/?trip=mussorie-boys-trip
```

Any friend can also type the same trip code inside the app and tap **Join**.
