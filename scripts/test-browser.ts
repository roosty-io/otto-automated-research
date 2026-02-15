import { getBrowserPool } from '../lib/automation/browser'

async function test() {
  console.log('Testing browser pool...')
  
  const pool = getBrowserPool()
  console.log('Pool created')
  
  try {
    const { page, browserId } = await pool.getPage()
    console.log(`Got page from browser: ${browserId}`)
    
    // Navigate to a simple page
    await page.goto('https://example.com', { waitUntil: 'networkidle2', timeout: 30000 })
    console.log('Navigated to example.com')
    
    const title = await page.title()
    console.log(`Page title: ${title}`)
    
    await page.close()
    console.log('Page closed')
    
    // Get stats
    const stats = pool.getStats()
    console.log('Pool stats:', stats)
    
    await pool.closeAll()
    console.log('Browser closed successfully')
    
    console.log('\n✅ Browser test PASSED!')
  } catch (error) {
    console.error('\n❌ Browser test FAILED:', error)
    await pool.closeAll()
    process.exit(1)
  }
}

test()
