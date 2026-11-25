#!/usr/bin/env node
/**
 * Copies the agent skills shipped in this package into a project, the way
 * `@shopify/hydrogen skills sync` does:
 *
 *   npx sanity-plugin-web-vitals skills sync [--force]
 *   npx sanity-plugin-web-vitals skills check [--mode=warn]
 *
 * Skills go to `.claude/skills` (Claude Code) and `.agents/skills` (Codex, Cursor, OpenCode).
 * A manifest in each folder records what was copied, so a skill edited in the project is kept
 * rather than overwritten (unless --force).
 */
import {createHash} from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import {dirname, join, relative} from 'node:path'
import {fileURLToPath} from 'node:url'

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const {name: PACKAGE_NAME, version: VERSION} = JSON.parse(
  readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'),
)
const SOURCE = join(PACKAGE_ROOT, 'skills')
const TARGETS = ['.claude/skills', '.agents/skills']
const MANIFEST = '.sanity-plugin-web-vitals.json'

const [, , group, command, ...flags] = process.argv
const force = flags.includes('--force')
const warnOnly = flags.includes('--mode=warn')

if (group !== 'skills' || !['sync', 'check'].includes(command)) {
  console.log(`Usage: npx ${PACKAGE_NAME} skills <sync|check> [--force] [--mode=warn]`)
  process.exit(group ? 1 : 0)
}

const shipped = Object.fromEntries(
  readdirSync(SOURCE)
    .filter((entry) => statSync(join(SOURCE, entry)).isDirectory())
    .map((skill) => [skill, hashDir(join(SOURCE, skill))]),
)

let pending = 0
let blocked = false

for (const target of TARGETS) {
  const dir = join(process.cwd(), target)
  const manifestPath = join(dir, MANIFEST)
  const manifest = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, 'utf8'))
    : {skills: {}}
  const next = {package: PACKAGE_NAME, version: VERSION, skills: {}}
  const actions = []

  for (const [skill, hash] of Object.entries(shipped)) {
    const local = join(dir, skill)
    const recorded = manifest.skills[skill]
    const localHash = existsSync(local) ? hashDir(local) : undefined

    if (!localHash) {
      actions.push(['add', skill])
    } else if (!recorded && !force) {
      console.error(
        `${target}/${skill} exists but was not created by ${PACKAGE_NAME}; use --force to replace it.`,
      )
      blocked = true
      continue
    } else if (localHash === hash) {
      next.skills[skill] = hash
      continue
    } else if (recorded && localHash !== recorded && !force) {
      console.warn(
        `${target}/${skill} was edited locally; kept. Use --force to replace it with ${VERSION}.`,
      )
      next.skills[skill] = recorded
      continue
    } else {
      actions.push(['update', skill])
    }
    next.skills[skill] = hash
  }

  for (const [skill, recorded] of Object.entries(manifest.skills)) {
    if (skill in shipped) continue
    const local = join(dir, skill)
    if (!existsSync(local)) continue
    if (hashDir(local) !== recorded && !force) {
      console.warn(`${target}/${skill} is no longer shipped but was edited locally; kept.`)
      continue
    }
    actions.push(['remove', skill])
  }

  pending += actions.length
  if (command === 'check' || blocked) {
    for (const [action, skill] of actions) console.log(`${target}: would ${action} ${skill}`)
    continue
  }

  mkdirSync(dir, {recursive: true})
  for (const [action, skill] of actions) {
    rmSync(join(dir, skill), {recursive: true, force: true})
    if (action !== 'remove') cpSync(join(SOURCE, skill), join(dir, skill), {recursive: true})
    console.log(
      `${target}: ${action === 'remove' ? 'removed' : action === 'add' ? 'added' : 'updated'} ${skill}`,
    )
  }
  writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`)
}

if (blocked) process.exit(1)

if (command === 'check' && pending > 0) {
  console.log(`Skills are out of date. Run: npx ${PACKAGE_NAME} skills sync`)
  process.exit(warnOnly ? 0 : 1)
}

function hashDir(dir) {
  const hash = createHash('sha256')
  for (const file of listFiles(dir)) {
    hash.update(relative(dir, file))
    hash.update(readFileSync(file))
  }
  return hash.digest('hex').slice(0, 16)
}

function listFiles(dir) {
  return readdirSync(dir)
    .sort()
    .flatMap((entry) => {
      const path = join(dir, entry)
      return statSync(path).isDirectory() ? listFiles(path) : [path]
    })
}
