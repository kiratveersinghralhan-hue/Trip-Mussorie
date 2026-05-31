# Mussoorie Boys Trip — Admin Editable Realtime Website

Root-only GitHub Pages website. No build tools, no npm, no folders.

## Files

- `index.html`
- `styles.css`
- `app.js`
- `README.md`
- `.nojekyll`

## What it does

- Realtime shared trip data using Firebase Cloud Firestore
- Premium mobile-first UI
- Friends and budgets
- Editable expenses
- Editable restaurant orders
- Final order total
- Admin mode with PIN
- Friends can view live data, but only admin can change data from the UI
- No bill photo uploads and no Firebase Storage needed

## First setup

1. Upload all root files to your GitHub Pages repo.
2. Open the website yourself first.
3. In the admin card, create an admin PIN.
4. Then copy the friend link and share it.

## Firebase Firestore rules for quick testing

Go to Firebase Console → Build → Firestore Database → Rules and paste:

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

## Important note

This admin PIN locks the website UI. With the quick testing rules above, Firestore itself is open to anyone who has the project details. For a small friends trip this is usually okay, but do not store private/sensitive data. A stronger admin system needs Firebase Authentication and stricter Firestore rules.


## Data safety

This version does not use Firebase Storage. It only uses Cloud Firestore.

Before replacing GitHub files in the future, open the site in admin mode and tap **Export data**. This downloads a JSON backup. If anything looks wrong later, unlock admin mode and use **Import data** to restore friends, budgets, expenses, orders, and the order total.

If your data looks empty after uploading new files, first check the **Shared trip code**. Firestore saves each trip under `/trips/YOUR-TRIP-CODE`. If you join a different code, you will see a fresh/default trip.
