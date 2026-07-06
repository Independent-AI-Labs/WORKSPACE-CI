import fs from 'fs/promises'
import fsSync from 'fs'
import net from 'net'
import path from 'path'
import { spawn } from 'child_process'

process.on('uncaughtException', (err) => {
  console.error('[dev-single] uncaughtException:', err)
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  console.error('[dev-single] unhandledRejection:', reason)
  process.exit(1)
})

const APP_PORT = Number(process.env.WIKI_DEV_PORT || 3001)
const HOST = process.env.WIKI_DEV_HOST || '0.0.0.0'
const LOCK_DIR = path.resolve(process.cwd(), '.next')
const LOCK_FILE = path.join(LOCK_DIR, 'dev-server.lock')

async function fileExists(p) {
  try {
    await fs.access(p)
    return true
  } catch (err) {
    console.warn(`[dev-single] fileExists check failed: ${err.message}`)
    return false
  }
}

function isProcessAlive(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    console.warn(`[dev-single] isProcessAlive check failed: ${err.message}`)
    return false
  }
}

async function ensurePortFree(port) {
  await new Promise((resolve, reject) => {
    const tester = net.createServer()
    tester.unref()
    tester.on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use.`))
      } else {
        reject(err)
      }
    })
    tester.listen({ port, host: HOST, exclusive: true }, () => {
      tester.close(resolve)
    })
  })
}

async function readExistingLock() {
  if (!(await fileExists(LOCK_FILE))) return null
  try {
    const raw = await fs.readFile(LOCK_FILE, 'utf8')
    const data = JSON.parse(raw)
    if (data && typeof data.pid === 'number') return data
  } catch (err) {
    console.warn(`[dev-single] Failed to parse lock file, treating as stale: ${err.message}`)
  }
  return null
}

async function writeLock() {
  await fs.mkdir(LOCK_DIR, { recursive: true })
  const payload = JSON.stringify({ pid: process.pid, createdAt: Date.now() })
  await fs.writeFile(LOCK_FILE, payload, { encoding: 'utf8', flag: 'w' })
}

function removeLockSync() {
  try {
    fsSync.unlinkSync(LOCK_FILE)
  } catch (err) {
    console.warn(`[dev-single] Failed to remove lock file: ${err.message}`)
  }
}

async function main() {
  const existing = await readExistingLock()
  if (existing && isProcessAlive(existing.pid)) {
    console.error(
      `Detected running dev server (pid: ${existing.pid}). Stop it before starting a new one.`,
    )
    process.exit(1)
  }

  try {
    await ensurePortFree(APP_PORT)
  } catch (err) {
    console.error(`${err.message}`)
    console.error(
      '   Stop the process holding the port or set WIKI_DEV_PORT to use a different one.',
    )
    process.exit(1)
  }

  await writeLock()

  await import('./sync-logos.mjs')

  const args = ['dev', '-H', HOST, '-p', String(APP_PORT), ...process.argv.slice(2)]
  const startedAt = Date.now()
  console.error(`[dev-single] starting next dev (pid=${process.pid}) on ${HOST}:${APP_PORT}`)

  const child = spawn('next', args, {
    stdio: 'inherit',
    env: process.env,
  })

  const cleanup = () => {
    removeLockSync()
  }

  process.on('exit', cleanup)
  process.on('SIGINT', () => {
    child.kill('SIGINT')
  })
  process.on('SIGTERM', () => {
    child.kill('SIGTERM')
  })
  process.on('SIGHUP', () => {
    child.kill('SIGHUP')
  })

  const heartbeat = setInterval(() => {
    const uptimeSec = Math.round((Date.now() - startedAt) / 1000)
    console.error(`[dev-single] heartbeat uptime=${uptimeSec}s child=${child.pid ?? 'dead'}`)
  }, 300_000)
  heartbeat.unref()

  child.on('exit', (code, signal) => {
    const uptimeSec = Math.round((Date.now() - startedAt) / 1000)
    console.error(
      `[dev-single] child exited code=${code} signal=${signal ?? 'none'} uptime=${uptimeSec}s`,
    )
    cleanup()
    if (signal) {
      process.kill(process.pid, signal)
    } else {
      process.exit(code || 1)
    }
  })

  child.on('error', (err) => {
    console.error('[dev-single] Failed to start Next dev server:', err)
    cleanup()
    process.exit(1)
  })
}

await main()
