# 🐱⚔️🐭 Ritual Cat × Chain Mouse

A creative on-chain cat-and-mouse game on **Ritual testnet (chain 1979)** where the cat is an AI and you are the mouse. Every cat move is decided by an LLM inference, and every game result is anchored on-chain via the `InferenceRegistry` smart contract.

![Ritual Cat × Chain Mouse](download/v4-start-en.png)

## ✨ Features

- **Verifiable AI gameplay** — the cat's strategy is decided by `z-ai-web-dev-sdk` LLM calls, with each inference hashed and anchored on-chain
- **Real on-chain anchoring** — game results are recorded via the `InferenceRegistry` smart contract deployed on Ritual testnet
- **4 languages** — EN / 中 / 日 / 한 with auto-detection
- **3 AI difficulty tiers** — Kitten 🐱 (1.5x), Hunter 🐯 (2.5x), Strategist 🦁 (5x) with progressive thinking depth, memory, traps, and wall-pinning
- **Wagering system** — bet CHEESE tokens, win multiplier payout if you survive 60s
- **Power-ups** — cheese collection, mouse holes (safe zones), speed boosts, decoys
- **Live AI inference feed** — see the cat's strategy + confidence update in real time
- **Leaderboard** — global survivor rankings

## 🎮 How to Play

1. Connect your EVM wallet (MetaMask recommended)
2. Switch to Ritual testnet (chain 1979) — the app auto-prompts
3. Pick a difficulty (Kitten / Hunter / Strategist)
4. Set your wager (10-500 CHEESE)
5. Click **Start Hunt** and survive 60 seconds!
6. Controls: **WASD/arrows** to move · **SPACE** to drop a decoy

When the game ends, your wallet will prompt you to sign a transaction that anchors the result on Ritual testnet. The server verifies the tx and marks your record as `Verified`.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Next.js 16 + React 19 + Tailwind 4 + shadcn/ui) │
│  ┌───────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  Game Canvas  │  │  Wallet Hook │  │  i18n (4 lang) │  │
│  │  (HTML5 + AI) │  │  (eth_*)     │  │  EN/中/日/한   │  │
│  └───────────────┘  └──────────────┘  └────────────────┘  │
└──────────────┬──────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│  Next.js API Routes                                         │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────────┐  │
│  │ /inference   │ │ /game-record │ │ /onchain-submit    │  │
│  │ (LLM brain)  │ │ (DB + verify)│ │ (calldata encoder) │  │
│  └──────────────┘ └──────────────┘ └────────────────────┘  │
└──────────────┬──────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│  Ritual Testnet (chain 1979)                                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  InferenceRegistry @ 0x7ce1d7BA...7560B              │  │
│  │  - recordGame(bytes32,uint8,bool,uint16)             │  │
│  │  - getRecord(address, uint256)                       │  │
│  │  - getRecordCount(address)                           │  │
│  └──────────────────────────────────────────────────────┘  │
│  RPC: https://rpc.ritualfoundation.org                     │
│  Explorer: https://explorer.ritualfoundation.org           │
└─────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
.
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Main game UI (start/playing/ended)
│   │   ├── api/
│   │   │   ├── inference/route.ts      # LLM cat brain
│   │   │   ├── game-record/route.ts    # Save + verify onchain
│   │   │   ├── onchain-submit/route.ts # Encode calldata
│   │   │   ├── leaderboard/route.ts
│   │   │   └── faucet/route.ts
│   │   └── layout.tsx
│   ├── components/
│   │   ├── game/game-canvas.tsx        # Canvas game loop + sprites
│   │   └── ui/                         # shadcn/ui components
│   ├── hooks/
│   │   ├── use-wallet.ts
│   │   ├── use-lang.ts                 # 4-lang picker
│   │   └── use-onchain-recorder.ts
│   └── lib/
│       ├── ritual.ts                   # Ritual testnet config
│       ├── onchain.ts                  # ABI + calldata encoder
│       ├── game.ts                     # Game types + difficulty config
│       └── i18n.ts                     # EN/中/日/한 dictionaries
├── contracts/                          # Foundry project
│   ├── src/InferenceRegistry.sol       # The deployed contract
│   ├── script/DeployInferenceRegistry.s.sol
│   └── foundry.toml
├── scripts/                            # Sprite processing
│   ├── process_sprites.py
│   ├── refine_sprites.py
│   └── explore_sprite_thresholds.py
└── public/                             # Cat/mouse/logo sprites
```

## 🔧 Smart Contract

The `InferenceRegistry` contract is deployed at:
```
0x7ce1d7BA8Cf307cC3c7e571577b5d94EFBB7560B
```
on Ritual testnet (chain 1979).

### Functions

| Name | Signature | Description |
|------|-----------|-------------|
| `recordGame` | `(bytes32 inferenceHash, uint8 difficulty, bool survived, uint16 cheeseCollected)` | Anchor a game result on-chain |
| `getRecord` | `(address player, uint256 index) → (bytes32, uint8, bool, uint16, uint64)` | Get a specific record |
| `getRecordCount` | `(address player) → uint256` | Get total records for a player |
| `getLatestRecord` | `(address player) → (...)` | Get the most recent record |
| `totalRecords` | `() → uint256` | Global record count |

### Redeploy

```bash
cd contracts
forge build
DEPLOYER_PRIVATE_KEY=0x... forge script script/DeployInferenceRegistry.s.sol \
  --rpc-url https://rpc.ritualfoundation.org \
  --broadcast
```

After redeploying, update `INFERENCE_REGISTRY.address` in `src/lib/ritual.ts`.

## 🚀 Local Development

```bash
# Install deps
bun install

# Push DB schema
bun run db:push

# Start dev server
bun run dev

# Open http://localhost:3000
```

You'll need a wallet with Ritual testnet RITUAL tokens. Get them from the [faucet](https://faucet.ritualfoundation.org) (requires access code).

## ☁️ Deploy to Vercel

1. Push this repo to GitHub
2. Import the repo on [vercel.com](https://vercel.com)
3. Set environment variables:
   - `DATABASE_URL` = `file:/tmp/custom.db` (or a PostgreSQL URL for production)
4. Deploy

Note: For production, swap SQLite for PostgreSQL by changing `prisma/schema.prisma` provider.

## 🎨 Customizing Sprites

The cat/mouse/logo sprites are processed from raw images via Python scripts:

```bash
# Generate threshold variants for comparison
python scripts/explore_sprite_thresholds.py
# → Open /public/_explorer/{mouse,cat,logo}_variants.png in browser

# Re-process sprites with chosen parameters
python scripts/process_sprites.py
python scripts/refine_sprites.py
```

## 🌍 Adding More Languages

Edit `src/lib/i18n.ts` and add a new dictionary (e.g. `es`, `fr`, `de`). Then add the language to `LANGS` in `src/hooks/use-lang.ts`.

## 🧠 Tuning AI Difficulty

Edit `DIFFICULTY_CONFIG` in `src/lib/game.ts`:

| Knob | Range | Effect |
|------|-------|--------|
| `thinkingDepth` | 1-5 | How many steps ahead the AI reasons |
| `memoryTicks` | 0-8 | How many past mouse positions the AI remembers |
| `usesTraps` | bool | Whether AI sets ambushes near cheese/holes |
| `usesBoundedPursuit` | bool | Whether AI avoids charging into holes |
| `aggression` | 0-1 | Direct pursuit vs flanking |
| `lookaheadSec` | 0-1.5 | Seconds of mouse trajectory to extrapolate |

## 📜 License

MIT

## 🔗 Links

- **Ritual Chain docs**: https://docs.ritualfoundation.org
- **Ritual Explorer**: https://explorer.ritualfoundation.org
- **Ritual Faucet**: https://faucet.ritualfoundation.org
- **Contract on explorer**: https://explorer.ritualfoundation.org/address/0x7ce1d7BA8Cf307cC3c7e571577b5d94EFBB7560B
