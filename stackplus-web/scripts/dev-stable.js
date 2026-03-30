const { execSync, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')

function killPortWindows(port) {
  try {
    // PowerShell command para matar o processo na porta
    const cmd = `$c=Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue; if($c){Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 500}`
    execSync(`powershell -Command "${cmd}"`, { stdio: 'ignore' })
    console.log(`[dev-stable] Killed port ${port}`)
  } catch (e) {
    // Silently ignore
  }
}

function killPortUnix(port) {
  try {
    execSync(`lsof -ti:${port} | xargs kill -9`, { stdio: 'ignore' })
    console.log(`[dev-stable] Killed port ${port}`)
  } catch (e) {
    // Silently ignore
  }
}

function killPort(port) {
  if (process.platform === 'win32') {
    killPortWindows(port)
  } else {
    killPortUnix(port)
  }
}

function cleanDir(relPath) {
  const target = path.resolve(projectRoot, relPath)
  try {
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true })
      console.log(`[dev-stable] Cleared ${target}`)
    }
  } catch (e) {
    console.log(`[dev-stable] Could not clear ${relPath}: ${e.message}`)
  }
}

console.log('[dev-stable] Cleaning stale processes and caches...')
killPort(3000)
killPort(3002)
cleanDir('.next')
cleanDir('node_modules/.cache')
console.log('[dev-stable] Starting Next.js in 2 seconds...')

// Wait a bit before starting
setTimeout(() => {
  const child = process.platform === 'win32'
    ? spawn('cmd.exe', ['/d', '/s', '/c', 'npx next dev'], {
        stdio: 'inherit',
        cwd: projectRoot,
        env: { ...process.env, FORCE_COLOR: '1' },
      })
    : spawn('npx', ['next', 'dev'], {
        stdio: 'inherit',
        cwd: projectRoot,
        env: { ...process.env, FORCE_COLOR: '1' },
      })

  child.on('exit', (code) => {
    process.exit(code || 0)
  })
}, 2000)
