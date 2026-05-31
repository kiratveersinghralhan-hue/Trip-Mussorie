# Mussoorie Boys Trip — Local TripSplit

A clean, premium-looking, GitHub Pages ready website for a boys trip to Mussoorie.

## Files

Everything is in the main root folder. No subfolders.

```txt
index.html
styles.css
app.js
README.md
.nojekyll
```

## Features

- Overview dashboard for budget, spending, remaining amount and average per person
- 7 friends by default
- Add or remove friends
- Edit friend names and budgets instantly
- Add quick expenses
- Add detailed expenses with custom split members
- Auto settlement: who should pay whom
- Restaurant order board
- Add item names by friend
- Add final restaurant total and split among people who ordered
- Upload bill photos
- Attach bill photo while adding an expense
- Local auto-save using browser storage
- Local live updates across tabs/windows on the same browser
- Export JSON backup

## Important: local-only storage

This version does not use Firebase, Supabase, login, server, or database.

That means:

- Data is saved only in the browser/device where the website is opened.
- It updates instantly on the same device.
- It can sync across multiple tabs/windows of the same browser.
- It will not sync live between different phones unless you later add a backend.

## GitHub Pages upload

1. Create a new GitHub repository.
2. Upload these files directly in the repository root.
3. Go to **Settings → Pages**.
4. Select **Deploy from branch**.
5. Choose your main branch and root folder.
6. Save.

## Backup tip

Use the **Export** button to download a JSON backup of the trip data.

## Bill photo note

Bill photos are compressed before saving, but browser storage is limited. If storage gets full, remove older bill photos or export your backup.
