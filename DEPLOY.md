# TimeFlow — Deployment Guide

## What you need
- A free GitHub account (sign up at github.com)
- The files in this folder

## Step-by-step

### 1. Create a GitHub account
Go to github.com and sign up for a free account if you don't have one.

### 2. Create a new repository
- Click the "+" icon (top right) → "New repository"
- Name it: `timeflow` (or anything you like)
- Set it to **Public**
- Click "Create repository"

### 3. Upload the files
- On your new repository page, click "uploading an existing file"
- Drag ALL files from this folder into the upload area:
    - index.html
    - style.css
    - app.js
    - sw.js
    - manifest.json
    - icon-192.png
    - icon-512.png
- Click "Commit changes"

### 4. Enable GitHub Pages
- Go to Settings (tab at top of repository)
- Scroll down to "Pages" in the left sidebar
- Under "Source", select "Deploy from a branch"
- Branch: main / root
- Click Save

### 5. Your app is live!
After 1-2 minutes, your app will be at:
  https://YOUR-USERNAME.github.io/timeflow

### 6. Install on iPhone
- Open that URL in Safari on your iPhone
- Tap the Share button (box with arrow)
- Tap "Add to Home Screen"
- Tap "Add"

TimeFlow now lives on your home screen like a native app, works offline,
and remembers all your data between sessions.

---

## Updating the app
To update: just re-upload the changed files to GitHub and wait 1-2 minutes.
Your data is stored on your phone and won't be affected by updates.
