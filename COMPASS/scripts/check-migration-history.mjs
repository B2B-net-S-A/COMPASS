import { readFile, readdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(appRoot, '..')
const migrationsDir = path.join(appRoot, 'supabase', 'migrations')
const migrationName = /^(\d{14})_([a-z0-9][a-z0-9_]*)\.sql$/
const reconciliationBase = '0c3f266530dc0cd1653c0d555645468935469a49'
const migrationRepoPrefix = 'COMPASS/supabase/migrations/'

const stripSqlComments = (sql) => sql
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/--.*$/gm, '')

const readBaseFile = (repoPath) => execFileSync(
  'git',
  ['show', `${reconciliationBase}:${repoPath}`],
  { cwd: repoRoot, maxBuffer: 16 * 1024 * 1024 },
)

const allFiles = await readdir(migrationsDir)
const files = allFiles
  .filter((file) => file.endsWith('.sql'))
  .sort()

const failures = []
const versions = new Map()

for (const file of files) {
  const match = migrationName.exec(file)
  if (!match) {
    failures.push(`${file}: expected YYYYMMDDHHMMSS_snake_case.sql`)
    continue
  }

  const [, version] = match
  const duplicate = versions.get(version)
  if (duplicate) {
    failures.push(`${file}: duplicate version ${version} (already used by ${duplicate})`)
  } else {
    versions.set(version, file)
  }

}

for (const file of allFiles.filter((name) => name.endsWith('.sql') || name.endsWith('.sql.disabled'))) {
  const sql = await readFile(path.join(migrationsDir, file), 'utf8')
  const executableSql = stripSqlComments(sql)
  if (/insert\s+into\s+(?:public\.)?auth\.users/i.test(executableSql)) {
    failures.push(`${file}: migration history must not create application users`)
  }
  if (/crypt\s*\(\s*['"][^'"]+['"]/i.test(executableSql)) {
    failures.push(`${file}: deterministic password material is forbidden`)
  }
  if (/encrypted_password\s*[,=]/i.test(executableSql)) {
    failures.push(`${file}: migration history must not contain password hashes`)
  }
  if (/update\s+(?:public\.)?profiles\s+set\s+role\s*=\s*['"]admin['"]\s+where\s+role\s*!=\s*['"]admin['"]/i.test(executableSql)) {
    failures.push(`${file}: blanket admin promotion is forbidden`)
  }
  if (/update\s+(?:public\.)?profiles[\s\S]{0,300}?set\s+role\s*=\s*['"]admin['"][\s\S]{0,300}?where\s+id\s*=\s*['"][0-9a-f-]{36}['"]/i.test(executableSql)) {
    failures.push(`${file}: identity-specific role promotion is forbidden`)
  }
  if (/insert\s+into\s+(?:public\.)?admin_access_list[\s\S]{0,300}?values\s*\(\s*['"][^'"]+@/i.test(executableSql)) {
    failures.push(`${file}: hardcoded administrator identity is forbidden`)
  }
  if (/delete\s+from\s+auth\.users\s+where\s+email/i.test(executableSql)) {
    failures.push(`${file}: identity-specific auth user deletion is forbidden`)
  }
}

const disabledFiles = allFiles.filter((file) => file.endsWith('.sql.disabled')).sort()
if (disabledFiles.length !== 3) {
  failures.push(`expected 3 documented .sql.disabled tombstones, found ${disabledFiles.length}`)
}

const manifestPath = path.join(appRoot, 'docs', 'database', 'migration-reconciliation-map.csv')
const manifestLines = (await readFile(manifestPath, 'utf8')).trim().split('\n')
const expectedHeader = 'old_file,new_file,old_version,new_version,content_changed,status'
if (manifestLines.shift() !== expectedHeader) {
  failures.push('migration reconciliation manifest has an unexpected header')
}
if (manifestLines.length !== 99) {
  failures.push(`expected 99 reconciliation rows, found ${manifestLines.length}`)
}

const manifestTargets = new Set()
const manifestSources = new Set()
const allowedStatuses = new Set([
  'renamed',
  'renamed_and_repaired',
  'content_repaired',
  'disabled',
  'promoted_to_migration',
])

for (const [index, line] of manifestLines.entries()) {
  const [oldFile, newFile, oldVersion, newVersion, contentChanged, status, ...extra] = line.split(',')
  const row = index + 2
  if (!oldFile || !newFile || !oldVersion || !newVersion || !contentChanged || !status || extra.length > 0) {
    failures.push(`manifest row ${row}: expected exactly six non-empty columns`)
    continue
  }
  if (!allFiles.includes(newFile)) {
    failures.push(`manifest row ${row}: target ${newFile} does not exist`)
  }
  const normalizedSource = oldFile.startsWith('COMPASS/')
    ? oldFile
    : `${migrationRepoPrefix}${oldFile}`
  if (manifestSources.has(normalizedSource)) {
    failures.push(`manifest row ${row}: duplicate source ${oldFile}`)
  }
  manifestSources.add(normalizedSource)
  if (oldVersion !== 'archive' && !path.basename(oldFile).startsWith(`${oldVersion}_`)) {
    failures.push(`manifest row ${row}: source filename does not match version ${oldVersion}`)
  }
  if (newVersion !== 'archive' && !newFile.startsWith(`${newVersion}_`)) {
    failures.push(`manifest row ${row}: target filename does not match version ${newVersion}`)
  }
  if (!['true', 'false'].includes(contentChanged)) {
    failures.push(`manifest row ${row}: content_changed must be true or false`)
  }
  if (!allowedStatuses.has(status)) {
    failures.push(`manifest row ${row}: unsupported status ${status}`)
  }
  if (manifestTargets.has(newFile)) {
    failures.push(`manifest row ${row}: duplicate target ${newFile}`)
  }
  manifestTargets.add(newFile)

  const statusShapeIsValid = (
    (status === 'renamed' && contentChanged === 'false' && oldFile !== newFile && newFile.endsWith('.sql'))
    || (status === 'renamed_and_repaired' && contentChanged === 'true' && oldFile !== newFile && newFile.endsWith('.sql'))
    || (status === 'content_repaired' && contentChanged === 'true' && oldFile === newFile && newFile.endsWith('.sql'))
    || (status === 'disabled' && contentChanged === 'true' && newFile.endsWith('.sql.disabled'))
    || (status === 'promoted_to_migration' && oldVersion === 'archive' && newFile.endsWith('.sql'))
  )
  if (!statusShapeIsValid) {
    failures.push(`manifest row ${row}: status/content/path combination is inconsistent`)
  }

  try {
    const oldContent = readBaseFile(normalizedSource)
    const newContent = await readFile(path.join(migrationsDir, newFile))
    const actuallyChanged = !oldContent.equals(newContent)
    if (actuallyChanged !== (contentChanged === 'true')) {
      failures.push(`manifest row ${row}: content_changed does not match the locked base commit`)
    }
  } catch (error) {
    failures.push(`manifest row ${row}: cannot verify source at locked base commit (${error.message})`)
  }
}

for (const file of disabledFiles) {
  if (!manifestTargets.has(file)) failures.push(`${file}: disabled tombstone is missing from reconciliation manifest`)
  const lines = (await readFile(path.join(migrationsDir, file), 'utf8')).split('\n')
  if (lines.some((line) => line.trim() !== '' && !line.trimStart().startsWith('--'))) {
    failures.push(`${file}: disabled tombstones must be comment-only, without executable SQL`)
  }
}

try {
  execFileSync('git', ['cat-file', '-e', `${reconciliationBase}^{commit}`], { cwd: repoRoot })
  const basePaths = execFileSync(
    'git',
    ['ls-tree', '-r', '--name-only', reconciliationBase, '--', migrationRepoPrefix],
    { cwd: repoRoot, encoding: 'utf8' },
  ).trim().split('\n').filter((entry) => entry.endsWith('.sql'))
  const basePathSet = new Set(basePaths)

  for (const basePath of basePaths) {
    const currentFile = path.join(repoRoot, basePath)
    let unchanged = false
    try {
      const [baseContent, currentContent] = [readBaseFile(basePath), await readFile(currentFile)]
      unchanged = baseContent.equals(currentContent)
    } catch {
      // A deleted/renamed source is expected only when the manifest records it.
    }
    if (!unchanged && !manifestSources.has(basePath)) {
      failures.push(`${basePath}: changed historical migration is missing from reconciliation manifest`)
    }
  }

  const baseVersions = basePaths
    .map((entry) => migrationName.exec(path.basename(entry))?.[1])
    .filter(Boolean)
    .sort()
  const baseHead = baseVersions.at(-1)
  for (const file of allFiles.filter((entry) => entry.endsWith('.sql') || entry.endsWith('.sql.disabled'))) {
    const repoPath = `${migrationRepoPrefix}${file}`
    const version = file.match(/^(\d{14})_/)?.[1]
    if (!basePathSet.has(repoPath) && !manifestTargets.has(file) && version && version <= baseHead) {
      failures.push(`${file}: backdated historical file is not covered by the reconciliation manifest`)
    }
  }
} catch (error) {
  failures.push(`locked reconciliation base ${reconciliationBase} is unavailable; CI checkout must use fetch-depth: 0 (${error.message})`)
}

const sortedVersions = [...versions.keys()].sort()
const encounteredVersions = files
  .map((file) => migrationName.exec(file)?.[1])
  .filter(Boolean)

if (encounteredVersions.join('\n') !== sortedVersions.join('\n')) {
  failures.push('active migration files are not in strictly increasing version order')
}

if (failures.length > 0) {
  console.error(`Migration history check failed (${failures.length}):`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`Migration history check passed: ${files.length} active migrations, ${versions.size} unique 14-digit versions.`)
