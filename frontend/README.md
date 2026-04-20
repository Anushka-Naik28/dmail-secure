# SecureMail — Decentralized Email Service

> **EtherX Innovations Pvt Ltd** · Open-Source · MIT License

A fully decentralized, end-to-end encrypted email platform built on peer-to-peer
technologies. No central server. No company reads your mail. You own your data.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Getting Started](#getting-started)
- [Running the App](#running-the-app)
- [How It Works](#how-it-works)
- [Security](#security)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Most email services (Gmail, Outlook, Yahoo) are **centralized** — a single company
stores and controls all your messages. SecureMail solves this by:

- Storing emails across a **peer-to-peer network** (GunDB)
- Encrypting every message with **OpenPGP RSA-2048** before it leaves your device
- Storing large content on **IPFS** (InterPlanetary File System)
- Never requiring a central server to send or receive mail

---

## Features

| Feature | Status |
|---|---|
| 📥 Inbox | ✅ Split-view, pinned mails, offline cache |
| 📤 Sent Mail | ✅ Instant update, IPFS CID display |
| 📝 Drafts | ✅ Auto-save every 30s, resume in compose |
| 🗑️ Trash | ✅ Restore + Empty Trash |
| 🚫 Spam Filtering | ✅ Auto-filter + Request folder |
| ↩️ Reply & Forward | ✅ Inline compose, PGP encrypted |
| 📎 File Attachments | ✅ Upload to IPFS, download by CID |
| 👥 Contact Management | ✅ PGP-encrypted contacts + public key store |
| 🔍 Global Search | ✅ Search across all folders |
| 🔔 Notifications | ✅ Real-time bell + unread badge |
| 🔒 Secure Encryption | ✅ RSA-2048 OpenPGP end-to-end |
| 📴 Offline Support | ✅ IndexedDB cache + send queue |
| ⛏️ Proof-of-Work | ✅ SHA-256 spam prevention |
| 📦 IPFS Explorer | ✅ Node status, pinning, backup |
| ☁️ Decentralized Backup | ✅ Full mailbox backup to IPFS |
| ⚙️ Settings | ✅ Theme, language, PGP key management |
| 🌙 Dark / Light Mode | ✅ |
| ✏️ Floating Compose | ✅ Gmail-style, minimize/maximize |

---

## Architecture

```
User
 ↓
Frontend (Next.js + React)
 ↓
Encryption Layer (OpenPGP.js — RSA-2048)
 ↓
Proof-of-Work (SHA-256 browser puzzle)
 ↓
Peer-to-Peer Database (GunDB relay)
 ↓
Distributed File Storage (IPFS / Kubo)
 ↓
Receiver
```

### Data Flow

1. User composes a mail
2. Browser computes a PoW puzzle (~100ms) to prevent spam
3. Message is PGP-encrypted with the recipient's public key
4. Encrypted content is uploaded to local IPFS node (Kubo)
5. IPFS Cluster replicates the content across all peers
6. The IPFS CID + metadata is stored in GunDB
7. Recipient's GunDB listener receives the CID in real-time
8. Recipient fetches encrypted content from IPFS
9. Recipient decrypts with their private key + password

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, React, TypeScript |
| Encryption | OpenPGP.js (RSA-2048) |
| P2P Database | GunDB |
| File Storage | IPFS / Kubo (self-hosted) |
| Clustering | IPFS Cluster |
| Backend/Relay | Node.js + GunDB relay |
| Offline Cache | IndexedDB + localStorage |
| Icons | Lucide React |

---

## Getting Started

### Prerequisites

- Node.js 18+
- [Kubo (IPFS daemon)](https://docs.ipfs.tech/install/command-line/) installed
- [IPFS Cluster](https://ipfscluster.io/documentation/getting_started/) (optional, for replication)

### Installation

```bash
# Clone the repository
git clone https://github.com/etherx-innovations/securemail.git
cd securemail

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### IPFS Setup

```bash
# Initialize IPFS (first time only)
ipfs init

# Configure CORS for local development
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["http://localhost:3000"]'
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["GET", "POST", "PUT"]'
```

---

## Running the App

You need **4 terminals** running simultaneously:

```bash
# Terminal 1 — IPFS daemon
ipfs daemon

# Terminal 2 — IPFS Cluster (optional, after daemon is ready)
ipfs-cluster-service daemon

# Terminal 3 — GunDB relay
cd backend
node server.js

# Terminal 4 — Next.js frontend
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## How It Works

### User Identity

When you register, SecureMail generates an **RSA-2048 key pair**:

```
Public Key  → stored on GunDB network (anyone can encrypt to you)
Private Key → stored on your device only (only you can decrypt)
```

Your identity is your email address. No phone number, no recovery email, no company account.

### Email Data Structure

```json
{
  "id": "msg_1234567890",
  "senderEmail": "alice@dmail.com",
  "receiverEmail": "bob@dmail.com",
  "subject": "encrypted",
  "message": "-----BEGIN PGP MESSAGE-----...",
  "cid": "QmXyz...",
  "time": "3/23/2026, 10:30:00 AM",
  "status": "inbox",
  "isStarred": false,
  "pow": { "nonce": 4721, "hash": "000a3f...", "difficulty": 3 }
}
```

### Proof-of-Work

Before every send, your browser solves a SHA-256 puzzle:

```
Find nonce such that SHA-256(mailHash + nonce) starts with "000"
```

This takes ~100ms for a human sender but makes sending millions of spam emails
computationally expensive. The proof is verified and stored with each mail.

### Spam Filtering

Incoming mails are scored automatically:

- **Trusted senders** (in your contacts) → Inbox directly
- **Unknown senders, no spam signals** → Request folder
- **High spam score** (keywords, all-caps, suspicious patterns) → Spam folder

### Offline Support

- Sent mails are queued in `localStorage` when offline
- Received mails are cached in `IndexedDB`
- Once online, the queue auto-processes and GunDB syncs automatically

---

## Security

| Mechanism | Implementation |
|---|---|
| End-to-end encryption | OpenPGP.js RSA-2048 |
| Key storage | Private key stays on device, never transmitted |
| Message storage | Encrypted before leaving browser |
| File storage | IPFS — content-addressed, immutable |
| Spam prevention | Proof-of-Work (SHA-256, difficulty 3) |
| Contact privacy | Contacts encrypted with your own PGP key |
| Offline privacy | IndexedDB encrypted blobs |

**Nobody — including EtherX Innovations — can read your messages.**

---

## Project Structure

```
securemail/
├── backend/
│   ├── server.js          # GunDB relay node (Express + Gun)
│   └── package.json
└── frontend/
    └── src/
        ├── app/
        │   └── dashboard/
        │       ├── inbox/page.tsx
        │       ├── sent/page.tsx
        │       ├── drafts/page.tsx
        │       ├── trash/page.tsx
        │       ├── spam/page.tsx
        │       ├── starred/page.tsx
        │       ├── all-mail/page.tsx
        │       ├── archive/page.tsx
        │       ├── contacts/page.tsx
        │       ├── settings/page.tsx
        │       ├── ipfs/page.tsx
        │       └── compose/page.tsx
        ├── components/
        │   ├── Header.tsx
        │   ├── Sidebar.tsx
        │   ├── ComposeWindow.tsx
        │   └── OfflineQueueProcessor.tsx
        └── utils/
            ├── gun.ts           # GunDB + OpenPGP send/receive
            ├── ipfs.ts          # IPFS upload/fetch/pin
            ├── mailStore.ts     # Global in-memory mail store
            ├── mailCache.ts     # IndexedDB offline cache
            ├── offlineQueue.ts  # localStorage send queue
            ├── contacts.ts      # Encrypted contact management
            └── spamFilter.ts    # Auto spam scoring + PoW
```

---

## Contributing

SecureMail is 100% open-source. Contributions are welcome.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'Add your feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request

### Areas open for contribution

- Mobile application (React Native / PWA)
- Browser extension (Chrome / Firefox)
- Blockchain-based identity verification
- Advanced ML spam detection
- Custom domain email support (`alice@yourdomain.com`)
- Multi-language support

---

## License

```
MIT License

Copyright (c) 2026 EtherX Innovations Pvt Ltd

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

<div align="center">
  <strong>Built with ❤️ by EtherX Innovations Pvt Ltd</strong><br/>
  Decentralized · Private · Open Source
</div>