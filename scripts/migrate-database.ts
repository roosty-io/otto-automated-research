#!/usr/bin/env npx tsx
/**
 * Database Migration Script
 *
 * Runs SQL migrations against Supabase using the SQL API.
 * Usage: npx tsx scripts/migrate-database.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

// Load .env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in environment')
  console.error('   Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// Extract project ref from URL
const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
if (!projectRef) {
  console.error('❌ Could not extract project ref from Supabase URL')
  process.exit(1)
}

interface MigrationResult {
  file: string
  success: boolean
  error?: string
}

async function executeSql(sql: string): Promise<{ success: boolean; error?: string }> {
  // Try the Supabase SQL API endpoint
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_raw_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'apikey': supabaseServiceKey!,
    },
    body: JSON.stringify({ sql_query: sql }),
  })

  if (response.ok) {
    return { success: true }
  }

  // Try alternative endpoint
  const pgMetaUrl = `https://${projectRef}.supabase.co/pg`
  const pgResponse = await fetch(`${pgMetaUrl}/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'apikey': supabaseServiceKey!,
    },
    body: JSON.stringify({ query: sql }),
  })

  if (pgResponse.ok) {
    return { success: true }
  }

  return {
    success: false,
    error: `API returned ${response.status}: ${await response.text()}`
  }
}

async function checkTableExists(tableName: string): Promise<boolean> {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/${tableName}?select=id&limit=1`,
    {
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'apikey': supabaseServiceKey!,
      },
    }
  )
  // 200 = exists, 404 = doesn't exist (PGRST116), other errors = check manually
  return response.ok
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗')
  console.log('║       OTTO Research Labs - Database Migration Runner       ║')
  console.log('╚════════════════════════════════════════════════════════════╝')
  console.log()
  console.log(`📦 Project: ${projectRef}`)
  console.log(`🔗 URL: ${supabaseUrl}`)
  console.log()

  // Check if base tables exist
  const hasStoreTiers = await checkTableExists('store_tiers')
  const hasStores = await checkTableExists('stores')
  const hasUsers = await checkTableExists('users')

  console.log('Current database state:')
  console.log(`  • store_tiers: ${hasStoreTiers ? '✅ exists' : '❌ missing'}`)
  console.log(`  • stores: ${hasStores ? '✅ exists' : '❌ missing'}`)
  console.log(`  • users: ${hasUsers ? '✅ exists' : '❌ missing'}`)
  console.log()

  // Define migration order (corrected for dependencies)
  const migrationOrder = [
    '000_combined_migration.sql',      // Core schema
    '001_extended_features.sql',        // Notifications, repricing
    '002_ebay_integration.sql',         // eBay tokens
    '003_scheduler.sql',                // Scheduler
    '006_automation_sessions.sql',      // Automation sessions
    '006_subscription_tiers.sql',       // Subscription tiers (may fail if users doesn't exist)
    '009_users_auth.sql',               // Users & auth
    '007_multi_store_management.sql',   // Multi-store
    '007_research_pipelines.sql',       // Research pipelines
    '008_admin_dashboard.sql',          // Admin dashboard
    '010_scraper_monitoring.sql',       // Scraper monitoring
    '011_profit_tracking.sql',          // Profit tracking
    '012_research_validation.sql',      // Research validation
    '013_cassini_optimization.sql',     // Cassini optimization
    '014_test_infrastructure.sql',      // Test infrastructure
  ]

  const dbDir = path.join(process.cwd(), 'database')
  const availableMigrations = fs.readdirSync(dbDir)
    .filter(f => f.endsWith('.sql') && !f.includes('drop') && !f.includes('quick_test'))
    .sort()

  console.log(`📁 Found ${availableMigrations.length} migration files`)
  console.log()

  // Try to execute migrations
  console.log('Attempting to run migrations via Supabase API...')
  console.log()

  const testResult = await executeSql('SELECT 1 as test')

  if (!testResult.success) {
    console.log('⚠️  Direct SQL execution not available via API.')
    console.log()
    console.log('Please run migrations manually in Supabase SQL Editor:')
    console.log()
    console.log(`   👉 https://supabase.com/dashboard/project/${projectRef}/sql/new`)
    console.log()
    console.log('Run these files in order:')
    console.log()

    let order = 1
    for (const migration of migrationOrder) {
      const filePath = path.join(dbDir, migration)
      if (fs.existsSync(filePath)) {
        console.log(`   ${order}. ${migration}`)
        order++
      }
    }

    console.log()
    console.log('📋 Quick start - copy this consolidated migration:')
    console.log()

    // Generate consolidated migration
    const consolidatedPath = path.join(dbDir, 'FULL_MIGRATION.sql')
    let consolidatedSql = `-- OTTO Research Labs - Full Database Migration
-- Generated: ${new Date().toISOString()}
-- Run this entire file in Supabase SQL Editor
-- https://supabase.com/dashboard/project/${projectRef}/sql/new

`

    for (const migration of migrationOrder) {
      const filePath = path.join(dbDir, migration)
      if (fs.existsSync(filePath)) {
        const sql = fs.readFileSync(filePath, 'utf-8')
        consolidatedSql += `
-- ============================================================================
-- ${migration}
-- ============================================================================

${sql}

`
      }
    }

    fs.writeFileSync(consolidatedPath, consolidatedSql)
    console.log(`   ✅ Created: database/FULL_MIGRATION.sql`)
    console.log()
    console.log('   Copy the contents of FULL_MIGRATION.sql and paste into SQL Editor')

  } else {
    console.log('✅ SQL execution available!')
    console.log()

    const results: MigrationResult[] = []

    for (const migration of migrationOrder) {
      const filePath = path.join(dbDir, migration)
      if (!fs.existsSync(filePath)) {
        continue
      }

      console.log(`Running: ${migration}...`)
      const sql = fs.readFileSync(filePath, 'utf-8')
      const result = await executeSql(sql)

      if (result.success) {
        console.log(`   ✅ Success`)
        results.push({ file: migration, success: true })
      } else {
        console.log(`   ❌ Failed: ${result.error}`)
        results.push({ file: migration, success: false, error: result.error })
      }
    }

    console.log()
    console.log('Migration Summary:')
    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length
    console.log(`   ✅ Successful: ${successful}`)
    console.log(`   ❌ Failed: ${failed}`)
  }

  console.log()
  console.log('Done!')
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
