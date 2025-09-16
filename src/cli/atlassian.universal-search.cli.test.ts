import { CliTestUtil } from '../utils/cli.test.util.js';
import {
	getAtlassianCredentials,
	hasAtlassianAuthCredentials,
} from '../utils/transport.util.js';
import { config } from '../utils/config.util.js';

describe('Confluence Universal Search CLI Command', () => {
	beforeAll(() => {
		config.load();

		const credentials = getAtlassianCredentials();
		if (!hasAtlassianAuthCredentials(credentials)) {
			console.warn(
				'Skipping universal search CLI tests: No authenticated credentials available',
			);
		}
	});

	const skipIfNoCredentials = () =>
		!hasAtlassianAuthCredentials(getAtlassianCredentials());

	it('should run universal search with default content types', async () => {
		if (skipIfNoCredentials()) {
			return;
		}

		const result = await CliTestUtil.runCommand([
			'search-all',
			'--query',
			'a',
			'--limit-per-type',
			'1',
		]);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('Confluence Universal Search');
		expect(result.stdout).toContain('Search Summary');
	}, 30000);

	it('should validate limit per type input', async () => {
		const result = await CliTestUtil.runCommand([
			'search-all',
			'--query',
			'anything',
			'--limit-per-type',
			'0',
		]);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain(
			'Invalid --limit-per-type value: Must be a positive integer.',
		);
	});
});
