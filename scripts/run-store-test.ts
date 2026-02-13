/**
 * Store Pipeline Test Runner
 *
 * Runs a controlled test of the research pipeline.
 *
 * Usage:
 *   npx ts-node scripts/run-store-test.ts
 *
 * Or via API:
 *   curl -X POST http://localhost:3000/api/test/store-pipeline \
 *     -H "Content-Type: application/json" \
 *     -d '{
 *       "testConfig": {
 *         "category": "Home & Garden",
 *         "maxProducts": 10,
 *         "stages": "research_sku"
 *       }
 *     }'
 */

const TEST_CONFIG = {
  // Test parameters - adjust as needed
  category: 'Home & Garden',
  query: '', // Optional search query
  maxProducts: 10,
  stages: 'research_sku' as const, // 'research_only' | 'research_sku' | 'full_pipeline'
  priceRange: { min: 15, max: 100 }, // $15-$100 to stay above $11 minimum buy price
  minSold: 5,
  dateRange: '30' as const,
}

// Optional: Specify a store ID to associate results
const STORE_ID = undefined // Set to store UUID if testing with a specific store

async function runTest() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  console.log('Starting test with config:', TEST_CONFIG)
  console.log('')

  // Start the test
  const startResponse = await fetch(`${baseUrl}/api/test/store-pipeline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeId: STORE_ID,
      testConfig: TEST_CONFIG,
    }),
  })

  const startResult = await startResponse.json()

  if (!startResult.success) {
    console.error('Failed to start test:', startResult.error)
    process.exit(1)
  }

  console.log(`Test started: ${startResult.testId}`)
  console.log(`Pipeline ID: ${startResult.pipelineId}`)
  console.log(`Check status: ${startResult.checkStatusUrl}`)
  console.log('')

  // Poll for status
  let completed = false
  let pollCount = 0
  const maxPolls = 60 // 5 minutes max

  while (!completed && pollCount < maxPolls) {
    await sleep(5000) // Check every 5 seconds

    const statusResponse = await fetch(
      `${baseUrl}/api/test/store-pipeline?testId=${startResult.testId}`
    )
    const statusResult = await statusResponse.json()

    if (!statusResult.success) {
      console.error('Failed to get status:', statusResult.error)
      break
    }

    const test = statusResult.test
    const progress = test.progress

    console.log(
      `[${progress.stage}] ${progress.percent}% - ` +
        `Found: ${progress.productsFound}, ` +
        `Sourced: ${progress.productsSourced}, ` +
        `SKUs: ${progress.skusGenerated}`
    )

    if (test.status === 'completed') {
      completed = true
      console.log('')
      console.log('=== TEST COMPLETED ===')
      console.log('Results:', JSON.stringify(test.results, null, 2))
    } else if (test.status === 'failed') {
      completed = true
      console.log('')
      console.log('=== TEST FAILED ===')
      console.log('Errors:', test.errors)
    }

    pollCount++
  }

  if (!completed) {
    console.log('')
    console.log('Test still running. Check status manually:')
    console.log(`curl "${baseUrl}/api/test/store-pipeline?testId=${startResult.testId}"`)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Run if executed directly
runTest().catch(console.error)
