# HomeFinance

> Personal finance manager with **Local First**. Works 100% offline and syncing is optional.

---

## Purpose

A simple app to control your personal finances that:

- ✅ Works **100% offline** on your phone
- ✅ Your data **never leaves your device** (unless you want to sync)
- ✅ Does not depend on internet, cloud or external services
- ✅ Syncing with other devices is **optional** via your own computer
- ✅ No tracking, no data analysis, no mandatory accounts

---

## Philosophy

HomeFinance follows simple principles:

- **Local First**: Your data belongs to you. Everything stays on your device.
- **Offline First**: All functionality works without internet.
- **No Dependencies**: Doesn't need Google, Apple, Firebase or any external service.
- **Optional Sync**: Want to use just on your phone? Perfect. Want to sync with another device? Use your computer as a hub.

You can use HomeFinance for years without ever turning on a computer.

---

## How It Works

### Solo Mode (Default)

Everything runs on your phone. No servers or internet required.

```
┌─────────────────────┐
│   PWA (Phone)       │
│                     │
│ • Income/Expenses   │
│ • Investments       │
│ • Reserves          │
│ • Dashboard         │
│ • History           │
│                     │
│  IndexedDB (Local)  │
└─────────────────────┘
```

---

### Sync Mode (Multiple Devices)

If you want to sync with another phone, your computer acts as a hub.

```
        Computer
      (Sync Hub)
            │
       SQLite + Sync
            │
      ┌─────┴─────┐
      │           │
   Phone 1    Phone 2
   (PWA)      (PWA)
   IndexedDB  IndexedDB
```

The computer only syncs when it's on. If you turn it off, the phones continue working normally.

---

## Features

- ➕ Record income and expenses
- 💰 Track investments and reserves
- 📊 View dashboard and history
- 🏷️ Organize with categories
- 📱 Works 100% offline
- 🔄 Sync with another device (optional)
- 📥 Export data as JSON or SQLite

---

## Tech Stack

**Mobile (PWA)**
- Preact + TypeScript (ultra-lightweight)
- Vite
- `@preact/signals` (state management)
- Dexie (IndexedDB wrapper)
- TailwindCSS + daisyUI
- Workbox (Service Workers)
- Biome (lint + format), Vitest (tests)

**Desktop (Sync Hub)**
- Tauri
- Rust
- SQLite
- TailwindCSS + daisyUI

**Bundle Size**: ~140kb gzipped — this is a product requirement, enforced in CI.

### Data model

Your data is an **append-only event log**, stored locally. Every change — creating a
transaction, editing a category — is a new immutable event. The app's state is rebuilt
by replaying that log.

This is what makes offline sync work without a coordinating server: an append-only log
is itself a CRDT. Two phones that edited for days while apart converge simply by
exchanging the events the other hasn't seen. No merge prompts, no server arbitrating.

It is also why there is no Automerge here despite the CRDT requirement — it ships ~1MB
of WASM, which alone would blow the entire bundle budget.

---

## Why This Way?

**Privacy**: Your data doesn't leave your device without your explicit authorization.

**Autonomy**: You don't depend on anyone to use the app. No internet? No problem.

**Control**: You decide if you want to sync or not. You decide who you share data with.

**Simplicity**: No accounts, no passwords, no terms of service. Just your app running on your phone.

---

## Links

- 📱 [Repository](https://github.com/LuizFer1/HomeFinance_Mobile)

Detailed design documents (architecture, event model, implementation plans) are kept in
the surrounding workspace under `docs/`, deliberately outside this repository — they are
working notes, not part of the shipped app.
