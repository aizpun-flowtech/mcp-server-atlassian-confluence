import { Logger } from './logger.util.js';
import { formatSeparator } from './formatter.util.js';

/**
 * Error types for classification
 */
export enum ErrorType {
	AUTH_MISSING = 'AUTH_MISSING',
	AUTH_INVALID = 'AUTH_INVALID',
	API_ERROR = 'API_ERROR',
	NOT_FOUND = 'NOT_FOUND',
	UNEXPECTED_ERROR = 'UNEXPECTED_ERROR',
}

/**
 * Custom error class with type classification
 */
export class McpError extends Error {
	type: ErrorType;
	statusCode?: number;
	originalError?: unknown;

	constructor(
		message: string,
		type: ErrorType,
		statusCode?: number,
		originalError?: unknown,
	) {
		super(message);
		this.name = 'McpError';
		this.type = type;
		this.statusCode = statusCode;
		this.originalError = originalError;
	}
}

/**
 * Helper to unwrap nested McpErrors and return the deepest original error.
 * This is useful when an McpError contains another McpError as `originalError`
 * which in turn may wrap the vendor (Confluence) error text or object.
 */
export function getDeepOriginalError(error: unknown): unknown {
	if (!error) {
		return error;
	}

	let current = error;
	let depth = 0;
	const maxDepth = 10; // Prevent infinite recursion

	while (
		depth < maxDepth &&
		current instanceof Error &&
		'originalError' in current &&
		current.originalError
	) {
		current = current.originalError;
		depth++;
	}

	return current;
}

/**
 * Create an authentication missing error
 */
export function createAuthMissingError(
	message: string = 'Authentication credentials are missing',
	originalError?: unknown,
): McpError {
	return new McpError(
		message,
		ErrorType.AUTH_MISSING,
		undefined,
		originalError,
	);
}

/**
 * Create an authentication invalid error
 */
export function createAuthInvalidError(
	message: string = 'Authentication credentials are invalid',
	originalError?: unknown,
): McpError {
	return new McpError(message, ErrorType.AUTH_INVALID, 401, originalError);
}

/**
 * Create an API error
 */
export function createApiError(
	message: string,
	statusCode?: number,
	originalError?: unknown,
): McpError {
	return new McpError(
		message,
		ErrorType.API_ERROR,
		statusCode,
		originalError,
	);
}

/**
 * Create a not found error
 */
export function createNotFoundError(
	message: string = 'Resource not found',
	originalError?: unknown,
): McpError {
	return new McpError(message, ErrorType.NOT_FOUND, 404, originalError);
}

/**
 * Create an unexpected error
 */
export function createUnexpectedError(
	message: string = 'An unexpected error occurred',
	originalError?: unknown,
): McpError {
	return new McpError(
		message,
		ErrorType.UNEXPECTED_ERROR,
		undefined,
		originalError,
	);
}

/**
 * Ensure an error is an McpError
 */
export function ensureMcpError(error: unknown): McpError {
	if (error instanceof McpError) {
		return error;
	}

	if (error instanceof Error) {
		return createUnexpectedError(error.message, error);
	}

	return createUnexpectedError(String(error));
}

/**
 * Format error for MCP tool response
 */
export function formatErrorForMcpTool(error: unknown): {
	content: Array<{ type: 'text'; text: string }>;
	metadata?: {
		errorType: ErrorType;
		statusCode?: number;
		errorDetails?: unknown;
	};
} {
	const methodLogger = Logger.forContext(
		'utils/error.util.ts',
		'formatErrorForMcpTool',
	);
	const mcpError = ensureMcpError(error);
	methodLogger.error(`${mcpError.type} error`, mcpError);

	// Get the deep original error for additional context
	const originalError = getDeepOriginalError(mcpError.originalError);

	// Safely extract details from the original error
	const errorDetails =
		originalError instanceof Error
			? { message: originalError.message }
			: originalError;

	return {
		content: [
			{
				type: 'text' as const,
				text: `Error: ${mcpError.message}`,
			},
		],
		metadata: {
			errorType: mcpError.type,
			statusCode: mcpError.statusCode,
			errorDetails,
		},
	};
}

/**
 * Format error for MCP resource response
 */
export function formatErrorForMcpResource(
	error: unknown,
	uri: string,
): {
	contents: Array<{
		uri: string;
		text: string;
		mimeType: string;
		description?: string;
	}>;
} {
	const methodLogger = Logger.forContext(
		'utils/error.util.ts',
		'formatErrorForMcpResource',
	);
	const mcpError = ensureMcpError(error);
	methodLogger.error(`${mcpError.type} error`, mcpError);

	return {
		contents: [
			{
				uri,
				text: `Error: ${mcpError.message}`,
				mimeType: 'text/plain',
				description: `Error: ${mcpError.type}`,
			},
		],
	};
}

/**
 * Handle error in CLI context with improved user feedback
 */
export function handleCliError(error: unknown): never {
	const methodLogger = Logger.forContext(
		'utils/error.util.ts',
		'handleCliError',
	);
	const mcpError = ensureMcpError(error);
	methodLogger.error(`${mcpError.type} error`, mcpError);

	// Get the deep original error for more context
	const originalError = getDeepOriginalError(mcpError.originalError);

	// Build a well-formatted CLI output using markdown-style helpers
	const cliLines: string[] = [];

	// Primary error headline
	cliLines.push(`❌  ${mcpError.message}`);

	// Status code (if any)
	if (mcpError.statusCode) {
		cliLines.push(`HTTP Status: ${mcpError.statusCode}`);
	}

	// Separator
	cliLines.push(formatSeparator());

	// Provide helpful context based on error type
	if (mcpError.type === ErrorType.AUTH_MISSING) {
		cliLines.push(
			'Tip: Make sure to set up your Atlassian credentials in the configuration file or environment variables:',
		);
		cliLines.push('- ATLASSIAN_SITE_NAME (required)');
		cliLines.push(
			'- ATLASSIAN_USER_EMAIL and ATLASSIAN_API_TOKEN (optional, required for private content)',
		);
	} else if (mcpError.type === ErrorType.AUTH_INVALID) {
		cliLines.push(
			'Tip: Check that your Atlassian API token is correct and has not expired.',
		);
		cliLines.push(
			'Also verify that the configured user has access to the requested resource.',
		);
	} else if (mcpError.type === ErrorType.API_ERROR) {
		if (mcpError.statusCode === 429) {
			cliLines.push(
				'Tip: You may have exceeded your Confluence API rate limits. Try again later.',
			);
		}
	} else if (mcpError.type === ErrorType.NOT_FOUND) {
		cliLines.push(
			'Tip: Verify the resource ID or key is correct and that you have access to view this resource.',
		);
		cliLines.push(
			'If you are using a space key, make sure it is spelled correctly (including case).',
		);
	}

	// Vendor error details (if available)
	if (originalError) {
		cliLines.push('Confluence API Error:');
		cliLines.push('```');
		if (typeof originalError === 'object' && originalError !== null) {
			// Try to extract the most useful parts of Confluence's error response
			const origErr = originalError as Record<string, unknown>;
			if (origErr.message) {
				cliLines.push(`Message: ${origErr.message}`);
			}
			if (origErr.detail) {
				cliLines.push(`Detail: ${origErr.detail}`);
			}
			if (origErr.title) {
				cliLines.push(`Title: ${origErr.title}`);
			}
			if (origErr.status) {
				cliLines.push(`Status: ${origErr.status}`);
			}

			// Handle errors array format
			if (
				origErr.errors &&
				Array.isArray(origErr.errors) &&
				origErr.errors.length > 0
			) {
				cliLines.push('Errors:');
				for (const err of origErr.errors) {
					if (typeof err === 'object' && err !== null) {
						const errObj = err as Record<string, unknown>;
						cliLines.push(
							`  - ${errObj.message || errObj.title || JSON.stringify(err)}`,
						);
					} else {
						cliLines.push(`  - ${String(err)}`);
					}
				}
			} else {
				// Fall back to JSON representation for anything else
				cliLines.push(JSON.stringify(originalError, null, 2));
			}
		} else {
			cliLines.push(String(originalError).trim());
		}
		cliLines.push('```');
	}

	// Display DEBUG tip
	if (!process.env.DEBUG || !process.env.DEBUG.includes('mcp:')) {
		cliLines.push(
			'For more detailed error information, run with DEBUG=mcp:* environment variable.',
		);
	}

	console.error(cliLines.join('\n'));
	process.exit(1);
}
