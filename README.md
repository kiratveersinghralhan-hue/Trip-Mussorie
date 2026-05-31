# Mussoorie Boys Trip

A clean GitHub Pages-ready trip budget app.

## Files

Keep all files in your repository root:

```txt
index.html
styles.css
app.js
README.md
.nojekyll
```

## What is fixed in this version

Friend names and budgets no longer sync on every typed letter.

Now it works like this:

1. Open Friends
2. Change all names/budgets
3. Tap **Save changes**
4. Then it syncs to everyone

This prevents the mobile keyboard from closing while typing.

## Firebase setup

This version uses **Cloud Firestore only**.

You do not need Firebase Storage. Bill photo upload is removed.

### Firestore Rules

Go to:

Firebase Console → Build → Firestore Database → Rules

Paste:

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

Then click **Publish**.

## Sharing

Upload these root files to GitHub Pages.

Open your website, copy the friend link, and share it. Everyone using the same trip code sees the same live data.

Example:

```txt
https://yourname.github.io/repo-name/?trip=mussorie-boys-trip
```

## Notes

These rules are open for easy trip use. Anyone with the trip code can edit the trip.
