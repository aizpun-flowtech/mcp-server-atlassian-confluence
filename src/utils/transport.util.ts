/* eslint-disable no-dupe-else-if */

import { Logger } from './logger.util.js';
import { config } from './config.util.js';
import {
	createAuthInvalidError,
	createApiError,
	createUnexpectedError,
	createNotFoundError,
	McpError,
} from './error.util.js';

/**
 * Interface for Atlassian API credentials
 */
export interface AtlassianCredentials {
	siteName: string;
	userEmail?: string;
	apiToken?: string;
}

/**
 * Reusable error message when the Confluence site name is not configured
 */
export const ATLASSIAN_SITE_REQUIRED_MESSAGE =
	'Confluence site name is required. Set ATLASSIAN_SITE_NAME (for example "example" for example.atlassian.net).';

let anonymousAccessLogged = false;

/**
 * Interface for HTTP request options
 */
export interface RequestOptions {
	method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
	headers?: Record<string, string>;
	body?: unknown;
}

// Create a logger for the utility
const utilLogger = Logger.forContext('utils/transport.util.ts');

/**
 * Get Atlassian credentials from environment variables
 * @returns AtlassianCredentials object or null if credentials are missing
 */
export function getAtlassianCredentials(): AtlassianCredentials | null {
	const siteName = config.get('ATLASSIAN_SITE_NAME');
	const userEmail = config.get('ATLASSIAN_USER_EMAIL');
	const apiToken = config.get('ATLASSIAN_API_TOKEN');

	if (!siteName) {
		utilLogger.warn(
			'Missing Atlassian site name. Please set ATLASSIAN_SITE_NAME environment variable.',
		);
		return null;
	}

	if (!userEmail || !apiToken) {
		if (!anonymousAccessLogged) {
			utilLogger.info(
				'No Atlassian user email or API token detected. Falling back to anonymous access for public Confluence content.',
			);
			anonymousAccessLogged = true;
		}
		return {
			siteName,
		};
	}

	return {
		siteName,
		userEmail,
		apiToken,
	};
}

/**
 * Determine if full authentication credentials are available
 */
export function hasAtlassianAuthCredentials(
	credentials: AtlassianCredentials | null,
): credentials is AtlassianCredentials & {
	userEmail: string;
	apiToken: string;
} {
	return Boolean(credentials?.userEmail && credentials?.apiToken);
}

/**
 * Fetch data from Atlassian API
 * @param credentials Atlassian API credentials
 * @param path API endpoint path (without base URL)
 * @param options Request options
 * @returns Response data
 */
export async function fetchAtlassian<T>(
	credentials: AtlassianCredentials,
	path: string,
	options: RequestOptions = {},
): Promise<T> {
	const fetchLogger = Logger.forContext(
		'utils/transport.util.ts',
		'fetchAtlassian',
	);
	const { siteName, userEmail, apiToken } = credentials;

	// Ensure path starts with a slash
	const normalizedPath = path.startsWith('/') ? path : `/${path}`;

	// Construct the full URL
	const baseUrl = `https://${siteName}.atlassian.net`;
	const url = `${baseUrl}${normalizedPath}`;

	// Set up authentication and headers
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		Accept: 'application/json',
		...options.headers,
	};

	const hasAuthHeader = Object.keys(headers).some(
		(header) => header.toLowerCase() === 'authorization',
	);

	if (userEmail && apiToken && !hasAuthHeader) {
		headers.Authorization = `Basic ${Buffer.from(`${userEmail}:${apiToken}`).toString('base64')}`;
	}

	// Prepare request options
	const requestOptions: RequestInit = {
		method: options.method || 'GET',
		headers,
		body: options.body ? JSON.stringify(options.body) : undefined,
	};

	fetchLogger.debug(`Calling Atlassian API: ${url}`);

	// Track API call performance
	const startTime = performance.now();
	let endTime: number;

	try {
		const response = await fetch(url, requestOptions);
		endTime = performance.now();
		const requestDuration = (endTime - startTime).toFixed(2);

		// Log successful API call duration at info level for significant operations
		if (parseFloat(requestDuration) > 1000) {
			// If request took more than 1 second, log at warn level
			fetchLogger.warn(`API call to ${path} took ${requestDuration}ms`);
		} else if (options.method && options.method !== 'GET') {
			// For non-GET operations, log at info level
			fetchLogger.info(
				`${options.method} operation to ${path} completed in ${requestDuration}ms`,
			);
		} else {
			// For regular GET operations, log at debug level
			fetchLogger.debug(`API call completed in ${requestDuration}ms`);
		}

		// Log the raw response status and headers
		fetchLogger.debug(
			`Raw response received: ${response.status} ${response.statusText}`,
			{
				url,
				status: response.status,
				statusText: response.statusText,
				headers: Object.fromEntries(response.headers.entries()),
			},
		);

		if (!response.ok) {
			const errorText = await response.text();
			fetchLogger.error(
				`API error: ${response.status} ${response.statusText}`,
				errorText,
			);

			// Try to parse the error response
			let errorMessage = `${response.status} ${response.statusText}`;
			let parsedError = null;

			try {
				if (
					errorText &&
					(errorText.startsWith('{') || errorText.startsWith('['))
				) {
					parsedError = JSON.parse(errorText);

					// Log the full parsed error for debugging
					fetchLogger.debug('Parsed Confluence error', parsedError);

					// Confluence v2 API - { "title": "xxx", "status": xxx, "detail": "xxx" } format
					if (parsedError.title) {
						errorMessage = parsedError.title;
						// Include detail if available
						if (
							parsedError.detail &&
							!errorMessage.includes(parsedError.detail)
						) {
							errorMessage += `: ${parsedError.detail}`;
						}
					}
					// Older API format or error format: { "message": "xxx" }
					else if (parsedError.message) {
						errorMessage = parsedError.message;
						// Optionally include reason if available
						if (
							parsedError.reason &&
							!errorMessage.includes(parsedError.reason)
						) {
							errorMessage += `: ${parsedError.reason}`;
						}
					}
					// Format: {"errors":[{"message":"Invalid query","extensions":{...}}]}
					else if (
						parsedError.errors &&
						Array.isArray(parsedError.errors) &&
						parsedError.errors.length > 0
					) {
						if (
							parsedError.errors[0].message ||
							parsedError.errors[0].title
						) {
							// Join multiple error messages if available, limiting to first 3
							const errorMsgs = parsedError.errors
								.slice(0, 3)
								.map((e: Record<string, unknown>) =>
									e.message
										? String(e.message)
										: e.title
											? String(e.title)
											: 'Unknown error',
								);
							errorMessage = errorMsgs.join('; ');

							// Add count indicator if there are more than 3 errors
							if (parsedError.errors.length > 3) {
								errorMessage += `; and ${parsedError.errors.length - 3} more errors`;
							}
						}
					}
					// Older API might return errorMessages array (like Jira)
					else if (
						parsedError.errorMessages &&
						Array.isArray(parsedError.errorMessages) &&
						parsedError.errorMessages.length > 0
					) {
						errorMessage = parsedError.errorMessages.join('; ');
					}
					// Try to look for status code description
					else if (parsedError.statusCode && parsedError.message) {
						errorMessage = `${parsedError.statusCode}: ${parsedError.message}`;
					}
				}
			} catch (parseError) {
				fetchLogger.debug(`Error parsing error response:`, parseError);
				// Fall back to the default error message
			}

			// Use the parsed error object or raw text as originalError for context
			const originalError = parsedError || errorText;

			// Classify HTTP errors based on status code
			if (response.status === 401) {
				throw createAuthInvalidError(
					`Authentication failed. Confluence API: ${errorMessage}`,
					originalError,
				);
			} else if (response.status === 403) {
				throw createApiError(
					`Access denied. Confluence API: ${errorMessage}`,
					403,
					originalError,
				);
			} else if (response.status === 404) {
				throw createNotFoundError(
					`Resource not found. Confluence API: ${errorMessage}`,
					originalError,
				);
			} else if (response.status === 429) {
				throw createApiError(
					`Rate limit exceeded. Confluence API: ${errorMessage}`,
					429,
					originalError,
				);
			} else if (response.status >= 500) {
				throw createApiError(
					`Confluence service error. Detail: ${errorMessage}`,
					response.status,
					originalError,
				);
			} else {
				// For other API errors
				throw createApiError(
					`Confluence API request failed. Detail: ${errorMessage}`,
					response.status,
					originalError,
				);
			}
		}

		// Clone the response to log its content without consuming it
		const clonedResponse = response.clone();
		const responseJson = await clonedResponse.json();
		fetchLogger.debug(`Response body:`, responseJson);

		return response.json() as Promise<T>;
	} catch (error) {
		endTime = performance.now();
		const failedRequestDuration = (endTime - startTime).toFixed(2);

		fetchLogger.error(
			`Request failed after ${failedRequestDuration}ms`,
			error,
		);

		// If it's already an McpError, just rethrow it
		if (error instanceof McpError) {
			throw error;
		}

		// Handle network errors (typically TypeErrors from fetch)
		if (error instanceof TypeError) {
			fetchLogger.debug('Network error details:', error);
			throw createApiError(
				`Network error connecting to Confluence API: ${error.message}`,
				500, // Will be classified as NETWORK_ERROR by detectErrorType
				error,
			);
		}

		// Handle JSON parsing errors
		if (error instanceof SyntaxError) {
			fetchLogger.debug('JSON parsing error:', error);
			throw createApiError(
				`Invalid response format from Confluence API: ${error.message}`,
				500,
				error,
			);
		}

		// Generic error handler for any other types of errors
		throw createUnexpectedError(
			`Unexpected error while calling Confluence API: ${error instanceof Error ? error.message : String(error)}`,
			error,
		);
	}
}
