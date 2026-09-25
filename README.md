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

Your data lives locally in IndexedDB, **one table per entity** (`users`,
`categories`, `paymentMethods`, `transactions`, `recurrences`, plus a `meta` table for
device state). Each row is the current state of that record, written through a single
repository. The app loads the tables into memory at boot and every write goes to disk
first, then to the screen.

Every row carries the columns the future sync with the hub needs:

- `updatedAt` — a Hybrid Logical Clock stamp, not the raw wall clock, so a phone with a
  clock running fast can't win every conflict. Conflicts are **last-write-wins per row**.
- `deletedAt` — deletes are logical: the row stays, marked, so the hub can propagate
  the deletion to the other phone.
- `dirty` — indexed `0 | 1` flag for "changed since the last sync".

Recurring transactions get deterministic ids per period, so two phones that generate
March's salary offline produce the same row instead of two salaries.

---

## Why This Way?

**Privacy**: Your data doesn't leave your device without your explicit authorization.

**Autonomy**: You don't depend on anyone to use the app. No internet? No problem.

**Control**: You decide if you want to sync or not. You decide who you share data with.

**Simplicity**: No accounts, no passwords, no terms of service. Just your app running on your phone.

---

## Links

- 📱 [Repository](https://github.com/LuizFer1/homefinance)

Detailed design documents (architecture, event model, implementation plans) are kept in
the surrounding workspace under `docs/`, deliberately outside this repository — they are
working notes, not part of the shipped app.
