/**
 * Database Migration Runner
 *
 * Runs SQL migrations against Supabase database.
 * Usage: npx ts-node scripts/run-migrations.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in environment')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

async function checkConnection(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('store_tiers')
      .select('id')
      .limit(1)

    if (error && error.code === '42P01') {
      // Table doesn't exist - base migration not run
      return false
    }

    return true
  } catch {
    return false
  }
}

async function runMigration(filePath: string): Promise<void> {
  const sql = fs.readFileSync(filePath, 'utf-8')
  const fileName = path.basename(filePath)

  console.log(`\nRunning migration: ${fileName}`)
  console.log('='.repeat(50))

  // Split by semicolons but be careful with functions
  // For simplicity, we'll execute the whole file at once using rpc
  try {
    // Try to execute via REST API
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'apikey': supabaseServiceKey,
      },
      body: JSON.stringify({ query: sql }),
    })

    if (!response.ok) {
      // exec_sql function doesn't exist, need to run manually
      console.log('Note: Cannot run SQL directly via API.')
      console.log('Please run the migration manually in Supabase SQL Editor.')
      console.log(`File: ${filePath}`)
      return
    }

    console.log(`✓ Migration ${fileName} completed successfully`)
  } catch (error) {
    console.error(`Error running migration:`, error)
    console.log('\nPlease run the migration manually in Supabase SQL Editor:')
    console.log(`File: ${filePath}`)
  }
}

async function main() {
  console.log('OTTO Research Labs - Database Migration Runner')
  console.log('='.repeat(50))
  console.log(`Supabase URL: ${supabaseUrl}`)

  const baseExists = await checkConnection()
  console.log(`\nBase schema exists: ${baseExists}`)

  const dbDir = path.join(process.cwd(), 'database')
  const migrations = fs.readdirSync(dbDir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  console.log(`\nFound ${migrations.length} migration files:`)
  migrations.forEach(m => console.log(`  - ${m}`))

  if (!baseExists) {
    console.log('\n⚠️  Base schema not detected.')
    console.log('Please run the migrations in the Supabase SQL Editor:')
    console.log('\n1. Go to: https://supabase.com/dashboard/project/sctfyrbpjxhivtjqizws/sql')
    console.log('2. Copy and paste the contents of each migration file')
    console.log('3. Run them in order (000 first, then 001)')
    console.log('\nMigration files:')
    migrations.forEach(m => {
      console.log(`  ${path.join(dbDir, m)}`)
    })
  } else {
    console.log('\n✓ Base schema exists. Checking for extended features...')

    // Check if notifications table exists
    const { error: notifError } = await supabase
      .from('notifications')
      .select('id')
      .limit(1)

    if (notifError && notifError.code === '42P01') {
      console.log('\n⚠️  Extended features schema not detected.')
      console.log('Please run 001_extended_features.sql in Supabase SQL Editor:')
      console.log(`  ${path.join(dbDir, '001_extended_features.sql')}`)
    } else {
      console.log('✓ Extended features schema exists.')
      console.log('\n✅ All migrations appear to be complete!')
    }
  }
}

main().catch(console.error)
