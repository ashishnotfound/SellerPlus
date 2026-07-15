#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

async function run() {
  const conn = process.env.SUPABASE_DB_CONN
  if (!conn) {
    console.error('Set SUPABASE_DB_CONN env var to the Postgres connection string')
    process.exit(2)
  }

  const migrationsDir = path.resolve(__dirname, '..', 'supabase', 'migrations')
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()
  console.log(`Applying ${files.length} migration(s) to: ${conn}`)

  const client = new Client({ connectionString: conn })
  await client.connect()

  try {
    for (const file of files) {
      const fullPath = path.join(migrationsDir, file)
      console.log('\n--- Applying', file, '---')
      const sql = fs.readFileSync(fullPath, 'utf8')
      try {
        await client.query('BEGIN')
        await client.query(sql)
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK').catch(()=>{})
        console.error('\nError applying', file)
        console.error(err && err.message ? err.message : err)
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
