import { CliTestUtil } from '../utils/cli.test.util.js';
import {
	getAtlassianCredentials,
	hasAtlassianAuthCredentials,
} from '../utils/transport.util.js';
import { config } from '../utils/config.util.js';

describe('Atlassian Confluence Spaces CLI Commands', () => {
	// Load configuration and check for credentials before all tests
	beforeAll(() => {
		// Load configuration from all sources
		config.load();

		// Log warning if credentials aren't available
		const credentials = getAtlassianCredentials();
		if (!hasAtlassianAuthCredentials(credentials)) {
			console.warn(
				'Skipping Atlassian Confluence Spaces CLI tests: No authenticated credentials available',
			);
		}
	});

	// Helper function to skip tests when credentials are missing
	const skipIfNoCredentials = () => {
		const credentials = getAtlassianCredentials();
		if (!hasAtlassianAuthCredentials(credentials)) {
			return true;
		}
		return false;
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

		return keyMatch[1].trim();
	}

	describe('ls-spaces command', () => {
		// Test default behavior (list all spaces)
		it('should list available spaces', async () => {
			if (skipIfNoCredentials()) {
				return;
			}

			// Run the CLI command
			const result = await CliTestUtil.runCommand(['ls-spaces']);

			// Check command exit code
			expect(result.exitCode).toBe(0);

			// Verify the output format
			if (!result.stdout.includes('No spaces found')) {
				// Validate expected Markdown structure
				expect(result.stdout).toMatch(/^#\s.+/m);
				expect(result.stdout).toContain('**ID**');
				expect(result.stdout).toContain('**Key**');
				expect(result.stdout).toContain('**Type**');
			}
		}, 30000); // Increased timeout for API call

		// Test with pagination
		it('should support pagination with --limit flag', async () => {
			if (skipIfNoCredentials()) {
				return;
			}

			// Run the CLI command with limit
			const result = await CliTestUtil.runCommand([
				'ls-spaces',
				'--limit',
				'1',
			]);

			// Check command exit code
			expect(result.exitCode).toBe(0);

			// If there are multiple spaces, pagination section should be present
			if (
				!result.stdout.includes('No spaces found') &&
				result.stdout.includes('items remaining')
			) {
				// Direct testing instead of using the utility
				expect(result.stdout).toContain('Next cursor');
			}
		}, 30000); // Increased timeout for API call

		// Test with type filtering
		it('should filter spaces by type', async () => {
			if (skipIfNoCredentials()) {
				return;
			}

			// Test with global type
			const result = await CliTestUtil.runCommand([
				'ls-spaces',
				'--type',
				'global',
			]);

			// Check command exit code
			expect(result.exitCode).toBe(0);

			// Verify the output is correctly filtered
			if (!result.stdout.includes('No spaces found')) {
				// Direct testing to verify markdown formatting
				expect(result.stdout).toMatch(/^#\s.+/m);
				expect(result.stdout).toContain('**ID**');
			}
		}, 30000);

		// Test with status filtering
		it('should filter spaces by status', async () => {
			if (skipIfNoCredentials()) {
				return;
			}

			// Test with current status
			const result = await CliTestUtil.runCommand([
				'ls-spaces',
				'--status',
				'current',
			]);

			// Check command exit code
			expect(result.exitCode).toBe(0);

			// Verify the output is correctly filtered
			if (!result.stdout.includes('No spaces found')) {
				// Direct testing to verify markdown formatting
				expect(result.stdout).toMatch(/^#\s.+/m);
				expect(result.stdout).toContain('**ID**');
			}
		}, 30000);

		// Test with invalid parameters
		it('should handle invalid type parameter properly', async () => {
			if (skipIfNoCredentials()) {
				return;
			}

			// Run the CLI command with invalid type value
			const result = await CliTestUtil.runCommand([
				'ls-spaces',
				'--type',
				'invalid-type',
			]);

			// Should fail with non-zero exit code
			expect(result.exitCode).not.toBe(0);

			// Should output error message
			expect(result.stderr).toContain('error');
		}, 15000);

		it('should handle invalid status parameter properly', async () => {
			if (skipIfNoCredentials()) {
				return;
			}

			// Run the CLI command with invalid status value
			const result = await CliTestUtil.runCommand([
				'ls-spaces',
				'--status',
				'invalid-status',
			]);

			// Should fail with non-zero exit code
			expect(result.exitCode).not.toBe(0);

			// Should output error message
			expect(result.stderr).toContain('error');
		}, 15000);
	});

	describe('get-space command', () => {
		// Test to fetch a specific space
		it('should retrieve space details by key', async () => {
			if (skipIfNoCredentials()) {
				return;
			}

			// Get a valid space key
			const spaceKey = await getSpaceKey();
			if (!spaceKey) {
				return; // Skip if no valid space key found
			}

			// Run the get-space command
			const result = await CliTestUtil.runCommand([
				'get-space',
				'--space-key',
				spaceKey,
			]);

			// Check command exit code
			expect(result.exitCode).toBe(0);

			// Verify the output structure and content
			expect(result.stdout).toContain(`# Confluence Space:`);
			expect(result.stdout).toContain(`**ID**`);
			expect(result.stdout).toContain(`**Key**: ${spaceKey}`);
			expect(result.stdout).toContain(`**Type**`);
			expect(result.stdout).toContain(`**Status**`);

			// Validate Markdown formatting
			expect(result.stdout).toMatch(/^#\s.+/m);
			expect(result.stdout).toContain('**ID**');
		}, 30000); // Increased timeout for API calls

		// Test with missing required parameter
		it('should fail when space key is not provided', async () => {
			if (skipIfNoCredentials()) {
				return;
			}

			// Run command without required parameter
			const result = await CliTestUtil.runCommand(['get-space']);

			// Should fail with non-zero exit code
			expect(result.exitCode).not.toBe(0);

			// Should indicate missing required option
			expect(result.stderr).toContain('required option');
		}, 15000);

		// Test with invalid space key
		it('should handle invalid space keys gracefully', async () => {
			if (skipIfNoCredentials()) {
				return;
			}

			// Use a deliberately invalid space key
			const invalidKey = 'INVALID_SPACE_KEY_THAT_DOES_NOT_EXIST';

			// Run command with invalid key
			const result = await CliTestUtil.runCommand([
				'get-space',
				'--space-key',
				invalidKey,
			]);

			// Should fail with non-zero exit code
			expect(result.exitCode).not.toBe(0);

			// Should contain error information
			expect(result.stderr).toContain('error');
		}, 30000);

		// Test with invalid key format
		it('should reject invalid key format', async () => {
			if (skipIfNoCredentials()) {
				return;
			}

			// Use a space key with invalid format (contains special characters)
			const invalidFormat = 'SPACE@KEY';

			// Run command with invalid format
			const result = await CliTestUtil.runCommand([
				'get-space',
				'--space-key',
				invalidFormat,
			]);

			// Should fail with non-zero exit code
			expect(result.exitCode).not.toBe(0);

			// Should contain error information about key format
			expect(result.stderr).toContain('error');
		}, 15000);
	});
});
