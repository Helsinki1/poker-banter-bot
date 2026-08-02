/// <reference types="vitest/config" />
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import {
  coerceEntry, insertEntry, parseCsv, serializeCsv,
} from './src/state/leaderboardCore.ts'

// Arcade leaderboard persistence: a plain CSV file at the project root,
// served over GET/POST /api/leaderboard in both dev and preview. The client
// (src/state/leaderboard.ts) falls back to localStorage when this middleware
// is not present (purely static hosting).
const CSV_PATH = resolve(import.meta.dirname, 'leaderboard.csv')

function readCsv(): string {
  try {
    return readFileSync(CSV_PATH, 'utf8')
  } catch {
    return '' // first run: no file yet
  }
}

function leaderboardMiddleware(): Connect.NextHandleFunction {
  return (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    if (!req.url?.startsWith('/api/leaderboard')) return next()
    const respond = (csv: string) => {
      res.setHeader('content-type', 'text/csv')
      res.end(csv)
    }
    if (req.method === 'GET') return respond(serializeCsv(parseCsv(readCsv())))
    if (req.method === 'POST') {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        let entry = null
        try { entry = coerceEntry(JSON.parse(body)) } catch { /* bad JSON */ }
        if (!entry) {
          res.statusCode = 400
          return res.end('invalid leaderboard entry')
        }
        const list = insertEntry(parseCsv(readCsv()), entry)
        writeFileSync(CSV_PATH, serializeCsv(list))
        respond(serializeCsv(list))
      })
      return
    }
    res.statusCode = 405
    res.end()
  }
}

function leaderboardCsv(): Plugin {
  return {
    name: 'leaderboard-csv',
    configureServer(server) { server.middlewares.use(leaderboardMiddleware()) },
    configurePreviewServer(server) { server.middlewares.use(leaderboardMiddleware()) },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), leaderboardCsv()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
