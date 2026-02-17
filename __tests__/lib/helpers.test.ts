import { describe, it, expect, vi } from 'vitest'
import { sleep, randomDelay, retry } from '@/lib/automation/helpers'

describe('Automation Helpers', () => {
  describe('sleep', () => {
    it('should delay execution for specified milliseconds', async () => {
      const start = Date.now()
      await sleep(100)
      const elapsed = Date.now() - start
      expect(elapsed).toBeGreaterThanOrEqual(95) // Allow small timing variance
      expect(elapsed).toBeLessThan(200)
    })
  })

  describe('randomDelay', () => {
    it('should delay between min and max milliseconds', async () => {
      const start = Date.now()
      await randomDelay(50, 150)
      const elapsed = Date.now() - start
      expect(elapsed).toBeGreaterThanOrEqual(45) // Allow small timing variance
      expect(elapsed).toBeLessThan(250)
    })

    it('should produce random delays', async () => {
      const delays: number[] = []
      for (let i = 0; i < 10; i++) {
        const start = Date.now()
        await randomDelay(10, 50)
        delays.push(Date.now() - start)
      }
      // Check that not all delays are exactly the same (randomness)
      const uniqueDelays = new Set(delays)
      expect(uniqueDelays.size).toBeGreaterThan(1)
    })
  })

  describe('retry', () => {
    it('should return result on first success', async () => {
      const fn = vi.fn().mockResolvedValue('success')
      const result = await retry(fn, { retries: 3 })
      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should retry on failure and eventually succeed', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success')

      const result = await retry(fn, { retries: 3, initialDelay: 10 })
      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it('should throw after all retries exhausted', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('persistent failure'))

      await expect(retry(fn, { retries: 2, initialDelay: 10 })).rejects.toThrow(
        'persistent failure'
      )
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should respect shouldRetry callback', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('non-retryable'))

      await expect(
        retry(fn, {
          retries: 3,
          initialDelay: 10,
          shouldRetry: (error) => !error.message.includes('non-retryable'),
        })
      ).rejects.toThrow('non-retryable')
      expect(fn).toHaveBeenCalledTimes(1)
    })
  })
})
