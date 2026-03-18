# Trove

A self-hosted personal link library web application.

## Tech Stack

- **Runtime:** [Bun](https://bun.sh)
- **Backend:** [Hono](https://hono.dev) (TypeScript)
- **Frontend:** React 19 + Vite 6 + Tailwind CSS 4
- **Database:** SQLite via `bun:sqlite`

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.0 or later

### Setup

1. Clone the repository
2. Copy the example environment file and configure it:
   ```bash
   cp env.example .env
   ```
3. Install dependencies:
   ```bash
   bun install
   cd frontend && bun install
   ```

### Development

Start the backend server (with hot reload):

```bash
bun run dev
```

Start the frontend dev server (Vite on port 5173, proxies API requests to port 3737):

```bash
bun run dev:frontend
```

### Available Scripts

| Script              | Description                              |
| ------------------- | ---------------------------------------- |
| `bun run dev`       | Start backend with hot reload            |
| `bun run dev:frontend` | Start Vite frontend dev server        |
| `bun run build:frontend` | Build frontend for production       |
| `bun run seed`      | Create the first admin user              |
| `bun run test`      | Run tests                                |
| `bun run lint`      | Type-check with TypeScript               |
| `bun run start`     | Start backend (production)               |

## Project Structure

```
TroveLinkManager/
├── src/              # Backend source (Hono server)
├── frontend/         # React + Vite frontend
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── index.html
│   └── vite.config.ts
├── data/             # SQLite database (gitignored)
├── env.example
├── package.json
└── tsconfig.json
```

## Licence

Private — all rights reserved.
