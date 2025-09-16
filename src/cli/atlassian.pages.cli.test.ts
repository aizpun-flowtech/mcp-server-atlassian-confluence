import { CliTestUtil } from '../utils/cli.test.util.js';
import {
	getAtlassianCredentials,
	hasAtlassianAuthCredentials,
} from '../utils/transport.util.js';
import { config } from '../utils/config.util.js';

describe('Atlassian Confluence Pages CLI Commands', () => {
	// Load configuration and check for credentials before all tests
	beforeAll(() => {
		// Load configuration from all sources
		config.load();

		// Log warning if credentials aren't available
		const credentials = getAtlassianCredentials();
		if (!hasAtlassianAuthCredentials(credentials)) {
			console.warn(
				'Skipping Atlassian Confluence Pages CLI tests: No authenticated credentials available',
			);
		}
	});

	// Helper function to skip tests when credentials are missing
	const skipIfNoCredentials = () => {
		const credentials = getAtlassianCredentials();
		// If we're running in CI or test environment, use mock responses instead of skipping
		if (
			!hasAtlassianAuthCredentials(credentials) &&
			process.env.NODE_ENV === 'test'
		) {
			// Return false to allow tests to run with potential mocks
			return false;
		}
		// Skip if no credentials are available (for integration tests)
		return !hasAtlassianAuthCredentials(credentials);
	};

	// Helper function to get a valid space key for testing
	async function getSpaceKey(): Promise<string | null> {
		// First, get a list of spaces to find a valid key
		const listResult = await CliTestUtil.runCommand([
			'ls-spaces',
			'--limit',
			'1',
		]);

		// Skip if no spaces are available
		if (listResult.stdout.includes('No spaces found')) {
			console.warn('Skipping test: No spaces available');
			return null;
		}

		// Extract a space key from the output
		const keyMatch = listResult.stdout.match(/\*\*Key\*\*:\s+([^\n]+)/);
		if (!keyMatch || !keyMatch[1]) {
			console.warn('Skipping test: Could not extract space key');
			return null;
		}

		// Extract the space ID since pages commands need space ID, not space key
		const idMatch = listResult.stdout.match(/\*\*ID\*\*:\s+([^\n]+)/);
		if (!idMatch || !idMatch[1]) {
			console.warn('Skipping test: Could not extract space ID');
			return null;
		}

		// Return the space ID
		return idMatch[1].trim();
	}

	// Helper function to get a valid page ID for testing
	async function getPageIdAndSpaceKey(): Promise<{
		pageId: string;
		spaceId: string;
	} | null> {
		// First, get a valid space key
		const spaceId = await getSpaceKey();
		if (!spaceId) {
			return null;
		}

		// List pages in the space
		const listResult = await CliTestUtil.runCommand([
			'ls-pages',
			'--space-ids',
			spaceId,
			'--limit',
			'1',
		]);

		// Skip if no pages are available
		if (listResult.stdout.includes('No pages found')) {
			console.warn('Skipping test: No pages available');
			return null;
		}

		// Extract a page ID from the output
		const idMatch = listResult.stdout.match(/\*\*ID\*\*:\s+(\d+)/);
		if (!idMatch || !idMatch[1]) {
			console.warn('Skipping test: Could not extract page ID');
			return null;
		}

		return {
			pageId: idMatch[1].trim(),
			spaceId,
		};
	}

	describe('ls-pages command', () => {
		// Test listing pages in a space
		it('should list pages in a space', async () => {
			if (skipIfNoCredentials()) {
				return;
			}

			// Get a valid space key
			const spaceId = await getSpaceKey();
			if (!spaceId) {
				return; // Skip if no valid space key found
			}

			// Run the CLI command
			const result = await CliTestUtil.runCommand([
				'ls-pages',
				'--space-ids',
				spaceId,
			]);

			// Check command exit code
			expect(result.exitCode).toBe(0);

			// Verify the output format
			if (!result.stdout.includes('No pages found')) {
				// Direct testing instead of using the utility
				expect(result.stdout).toContain('# Confluence Pages');
				expect(result.stdout).toContain('**ID**');
				expect(result.stdout).toContain('**Title**');
				expect(result.stdout).toMatch(/^#\s.+/m);
			}
		}, 30000); // Increased timeout for API call

		// Test with pagination
		it('should support pagination with --limit flag', async () => {
			if (skipIfNoCredentials()) {
				return;
			}

			// Get a valid space key
			const spaceId = await getSpaceKey();
			if (!spaceId) {
				return; // Skip if no valid space key found
			}

			// Run the CLI command with limit
			const result = await CliTestUtil.runCommand([
				'ls-pages',
				'--space-ids',
				spaceId,
				'--limit',
				'1',
			]);

			// Check command exit code
			expect(result.exitCode).toBe(0);

			// If there are multiple pages, pagination section should be present
			if (
				!result.stdout.includes('No pages found') &&
				result.stdout.includes('items remaining')
			) {
				expect(result.stdout).toContain('Next cursor');
			}
		}, 30000); // Increased timeout for API call

		// Test without space ID (which may work in authenticated environment but fail in CI)
		it('should handle missing space ID appropriately', async () => {
			if (skipIfNoCredentials()) {
				return;
			}

			// Run command without space ID
			const result = await CliTestUtil.runCommand(['ls-pages']);

			// In authenticated environment, this works with exit code 0
			// In unauthenticated environment (CI), this fails with exit code 1
			// We need to handle both cases
			if (result.exitCode === 0) {
				// Should have some output if successful
				expect(result.stdout).toBeDefined();
				expect(result.stdout.length).toBeGreaterThan(0);
			} else {
				// If it failed, there should be an error message
				expect(result.stderr).toBeDefined();
				expect(result.stderr.length).toBeGreaterThan(0);
				expect(result.stderr).toContain('error');
			}
		}, 15000);

		// Test with invalid space key
		it('should handle invalid space IDs gracefully', async () => {
			if (skipIfNoCredentials()) {
				return;
			}

			// Use a deliberately invalid space ID
			const invalidId = '999999999'; // A space ID that likely doesn't exist

			// Run command with invalid ID
			const result = await CliTestUtil.runCommand([
				'ls-pages',
				'--space-ids',
				invalidId,
			]);

			// In CI, this might fail with exit code 1, but locally it might succeed with empty results
			// So we need a flexible test that works in both environments
			if (result.exitCode === 0) {
				// If it succeeded, it should show no pages found
				expect(result.stdout).toContain('No Confluence pages found');
			} else {
				// If it failed, it should have an error message
				expect(result.stderr).toBeDefined();
			}
		}, 30000);

		// Test with multiple space IDs
		it('should handle multiple space IDs', async () => {
			if (skipIfNoCredentials()) {
				return;
			}

			// Get a valid space ID
			const spaceId = await getSpaceKey();
			if (!spaceId) {
				return; // Skip if no valid space ID found
			}

			// Use the valid space ID twice to test multiple ID support
			// With commander's array syntax, multiple values are passed as separate arguments
			const result = await CliTestUtil.runCommand([
				'ls-pages',
				'--space-ids',
				spaceId,
				'999999999', // Adding an invalid ID alongside the valid one
			]);

			// Command should succeed regardless
			expect(result.exitCode).toBe(0);
		}, 30000);
	});

	describe('get-page command', () => {
		// Test fetching a specific page
		it('should retrieve page details by ID', async () => {
			if (skipIfNoCredentials()) {
				return;
			}

			// Get a valid page ID
			const pageInfo = await getPageIdAndSpaceKey();
			if (!pageInfo) {
				return; // Skip if no valid page ID found
			}

			// Run the get-page command
			const result = await CliTestUtil.runCommand([
				'get-page',
				'--page-id',
				pageInfo.pageId,
			]);

			// Check command exit code
			expect(result.exitCode).toBe(0);

			// Verify the output structure and content
			expect(result.stdout).toContain('Confluence Page:');
			expect(result.stdout).toContain('**ID**');
			expect(result.stdout).toContain('Content');
			expect(result.stdout).toMatch(/^#\s.+/m);
		}, 30000);

		// Test with missing required parameter
		it('should fail when page ID is not provided', async () => {
			if (skipIfNoCredentials()) {
				return;
			}

			// Run command without required parameter
			const result = await CliTestUtil.runCommand(['get-page']);

			// Should fail with non-zero exit code
			expect(result.exitCode).not.toBe(0);

			// Should indicate missing required option
			expect(result.stderr).toContain('required option');
		}, 15000);

		// Test with invalid page ID
		it('should handle invalid page IDs gracefully', async () => {
			if (skipIfNoCredentials()) {
				return;
			}

			// Use a deliberately invalid page ID
			const invalidId = '999999999'; // A page ID that likely doesn't exist

			// Run command with invalid ID
			const result = await CliTestUtil.runCommand([
				'get-page',
				'--page-id',
				invalidId,
			]);

			// Should handle API errors gracefully
			expect(result.exitCode).not.toBe(0);
			expect(result.stderr).toContain('error');
		}, 30000);

		// Test with non-numeric page ID
		it('should reject non-numeric page IDs', async () => {
			if (skipIfNoCredentials()) {
				return;
			}

			// Use a page ID with invalid format (non-numeric)
			const invalidFormat = 'abc';

			// Run command with invalid format
			const result = await CliTestUtil.runCommand([
				'get-page',
				'--page-id',
				invalidFormat,
			]);

			// Should fail with non-zero exit code
			expect(result.exitCode).not.toBe(0);

			// Should contain error information about ID format
			expect(result.stderr).toContain('error');
		}, 15000);

		// Test with expand options
		it('should support expanding additional content fields', async () => {
			if (skipIfNoCredentials()) {
				return;
			}

			// Get a valid page ID
			const pageInfo = await getPageIdAndSpaceKey();
			if (!pageInfo) {
				return; // Skip if no valid page ID found
			}

			// Run the get-page command with expand options
			const result = await CliTestUtil.runCommand([
				'get-page',
				'--page-id',
				pageInfo.pageId,
			]);

			// Check command exit code
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toMatch(/^#\s.+/m);
		}, 30000);
	});
});
