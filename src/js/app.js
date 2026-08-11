import { LiveUpdate } from '@capawesome/capacitor-live-update'

// Change this marker before each upload so bundle switches are visible on screen.
const MARKER = 'BUNDLE v1'

const el = (id) => document.getElementById(id)
const log = (msg) => {
  el('log').textContent = new Date().toISOString().slice(11, 19) + '  ' + msg + '\n' + el('log').textContent
}

async function refreshState () {
  try {
    const { bundleId } = await LiveUpdate.getCurrentBundle()
    el('bundle').textContent = bundleId || '(built-in)'
  } catch (e) {
    el('bundle').textContent = 'error: ' + e
  }
}

el('marker').textContent = MARKER

// ready() confirms the boot so readyTimeout does not roll back (mirrors real apps)
LiveUpdate.ready()
  .then((r) => log('ready() ok, rollback=' + r.rollback))
  .catch((e) => log('ready() failed: ' + e))
refreshState()

el('btn-sync').onclick = async () => {
  log('sync()...')
  try {
    const result = await LiveUpdate.sync()
    log('sync() -> nextBundleId=' + result.nextBundleId)
  } catch (e) {
    log('sync() failed: ' + e)
  }
  refreshState()
}

el('btn-reload').onclick = async () => {
  log('reload()...')
  try {
    await LiveUpdate.reload()
    // if reload really applies the next bundle, this line never logs -
    // the webview reboots into the new bundle
    log('reload() returned')
  } catch (e) {
    log('reload() failed: ' + e)
  }
  refreshState()
}

el('btn-current').onclick = refreshState

el('btn-blocked').onclick = async () => {
  try {
    const r = await LiveUpdate.getBlockedBundles()
    log('blocked bundles: ' + JSON.stringify(r))
  } catch (e) {
    log('getBlockedBundles failed: ' + e)
  }
}
