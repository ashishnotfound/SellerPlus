#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

function redactedConnectionTarget(value) {
  try {
    const url = new URL(value)
    if (url.password) url.password = '***'
    return url.toString()
  } catch {
    return '[redacted connection string]'
  }
}

function migrationHasTransaction(sql) {
  return /^\s*begin\s*;/im.test(sql) && /^\s*commit\s*;/im.test(sql)
}

async function run() {
  const conn = process.env.SUPABASE_DB_CONN
  if (!conn) {
    console.error('Set SUPABASE_DB_CONN env var to the Postgres connection string')
    process.exit(2)
  }

  const migrationsDir = path.resolve(__dirname, '..', 'supabase', 'migrations')
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()
  console.log(`Applying ${files.length} migration(s) to: ${redactedConnectionTarget(conn)}`)

  const client = new Client({ connectionString: conn })
  await client.connect()

  try {
    for (const file of files) {
      const fullPath = path.join(migrationsDir, file)
      console.log('\n--- Applying', file, '---')
      const sql = fs.readFileSync(fullPath, 'utf8')
      const ownsTransaction = migrationHasTransaction(sql)
      try {
        if (!ownsTransaction) await client.query('BEGIN')
        await client.query(sql)
        if (!ownsTransaction) await client.query('COMMIT')
      } catch (err) {
        if (!ownsTransaction) await client.query('ROLLBACK').catch(()=>{})
        console.error('\nError applying', file)
        const message = err && err.message ? err.message : String(err)
        console.error(message.replaceAll(conn, '[redacted connection string]'))
        process.exitCode = 1
        throw err
      }
    }
    console.log('\nAll migrations applied successfully')
  } finally {
    await client.end()
  }
}

run().catch(err => {
  console.error('\nMigration run aborted.')
  if (err && err.message) console.error(err.message)
  if (err && err.stack) console.error(err.stack)
  process.exit(1)
})
