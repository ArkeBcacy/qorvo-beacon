import { describe, expect, it, vi } from 'vitest';
import retryWithBackoff from './retryWithBackoff.js';

// Test constants
const ONE_CALL = 1;
const TWO_CALLS = 2;
const THREE_CALLS = 3;
const FIVE_ITERATIONS = 5;
const MIN_ELAPSED_MS = 250;
const MIN_ELAPSED_CAPPED_MS = 350;
const MAX_ELAPSED_MS = 1000;
const DELAY_BUCKET_MS = 10;

describe('retryWithBackoff', () => {
	it('should succeed on first attempt', async () => {
		const fn = vi.fn<() => Promise<string>>().mockResolvedValue('success');

		const result: string = await retryWithBackoff(fn);

		expect(result).toBe('success');
		expect(fn).toHaveBeenCalledTimes(ONE_CALL);
	});

	it('should retry on rate limit error (429)', async () => {
		const rateLimitError = {
			error_code: 429,
			error_message: 'Rate limit exceeded',
		};
		const fn = vi
			.fn<() => Promise<string>>()
			.mockRejectedValueOnce(rateLimitError)
			.mockResolvedValueOnce('success');

		const result: string = await retryWithBackoff(fn, {
			initialDelay: 10,
			jitter: false,
		});

		expect(result).toBe('success');
		expect(fn).toHaveBeenCalledTimes(TWO_CALLS);
	});

	it('should not retry on non-rate-limit errors', async () => {
		const otherError = { error_code: 500, error_message: 'Server error' };
		const fn = vi.fn<() => Promise<string>>().mockRejectedValue(otherError);

		await expect(retryWithBackoff(fn)).rejects.toEqual(otherError);
		expect(fn).toHaveBeenCalledTimes(ONE_CALL);
	});

	it('should throw after max attempts', async () => {
		const rateLimitError = {
			error_code: 429,
			error_message: 'Rate limit exceeded',
		};
		const fn = vi.fn<() => Promise<string>>().mockRejectedValue(rateLimitError);

		await expect(
			retryWithBackoff(fn, {
				initialDelay: 10,
				jitter: false,
				maxAttempts: 3,
			}),
		).rejects.toEqual(rateLimitError);

		expect(fn).toHaveBeenCalledTimes(THREE_CALLS);
	});

	it('should apply exponential backoff', async () => {
		const rateLimitError = {
			error_code: 429,
			error_message: 'Rate limit exceeded',
		};
		const fn = vi
			.fn<() => Promise<string>>()
			.mockRejectedValueOnce(rateLimitError)
			.mockRejectedValueOnce(rateLimitError)
			.mockResolvedValueOnce('success');

		const startTime = Date.now();

		const result: string = await retryWithBackoff(fn, {
			backoffFactor: 2,
			initialDelay: 100,
			jitter: false,
			maxDelay: 10000,
		});

		const elapsed = Date.now() - startTime;

		expect(result).toBe('success');
		expect(fn).toHaveBeenCalledTimes(THREE_CALLS);
		// First retry: 100ms, second retry: 200ms = ~300ms minimum
		expect(elapsed).toBeGreaterThanOrEqual(MIN_ELAPSED_MS);
	});

	it('should respect maxDelay', async () => {
		const rateLimitError = {
			error_code: 429,
			error_message: 'Rate limit exceeded',
		};
		const fn = vi
			.fn<() => Promise<string>>()
			.mockRejectedValueOnce(rateLimitError)
			.mockRejectedValueOnce(rateLimitError)
			.mockResolvedValueOnce('success');

		const startTime = Date.now();

		const result: string = await retryWithBackoff(fn, {
			backoffFactor: 100,
			initialDelay: 1000,
			jitter: false,
			maxDelay: 200, // Cap delays at 200ms
		});

		const elapsed = Date.now() - startTime;

		expect(result).toBe('success');
		// Should use maxDelay (200ms) for both retries = ~400ms
		expect(elapsed).toBeGreaterThanOrEqual(MIN_ELAPSED_CAPPED_MS);
		expect(elapsed).toBeLessThan(MAX_ELAPSED_MS); // Should not use 1000ms * 100 = 100s
	});

	it('should handle jitter option', async () => {
		const rateLimitError = {
			error_code: 429,
			error_message: 'Rate limit exceeded',
		};

		// Run multiple times to verify jitter adds randomness
		const delays: number[] = [];

		for (let i = 0; i < FIVE_ITERATIONS; i++) {
			const fnCopy = vi
				.fn<() => Promise<string>>()
				.mockRejectedValueOnce(rateLimitError)
				.mockResolvedValueOnce('success');

			const startTime = Date.now();
			const result: string = await retryWithBackoff(fnCopy, {
				initialDelay: 100,
				jitter: true,
			});
			expect(result).toBe('success');
			delays.push(Date.now() - startTime);
		}

		// With jitter, delays should vary (not all exactly the same)
		const uniqueDelays = new Set(
			delays.map((d) => Math.floor(d / DELAY_BUCKET_MS)),
		);
		expect(uniqueDelays.size).toBeGreaterThan(ONE_CALL);
	});

	it('should handle non-object errors', async () => {
		const stringError = 'Some error';
		const fn = vi.fn<() => Promise<string>>().mockRejectedValue(stringError);

		await expect(retryWithBackoff(fn)).rejects.toBe(stringError);
		expect(fn).toHaveBeenCalledTimes(ONE_CALL);
	});

	it('should handle null/undefined errors', async () => {
		const fn = vi.fn<() => Promise<string>>().mockRejectedValue(null);

		await expect(retryWithBackoff(fn)).rejects.toBeNull();
		expect(fn).toHaveBeenCalledTimes(ONE_CALL);
	});
});
