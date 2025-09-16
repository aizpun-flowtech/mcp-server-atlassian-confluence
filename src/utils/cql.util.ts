/**
 * Utility helpers for working with Confluence Query Language (CQL).
 * Provides functions for safely constructing CQL statements.
 */

/**
 * Escape a value for safe inclusion inside CQL double quotes.
 * Uses JSON.stringify to reuse the platform escaping rules and
 * removes the wrapping quotes that JSON adds.
 *
 * @param value - Raw string value to escape for CQL usage
 * @returns Escaped string suitable for use within a quoted CQL clause
 */
export function escapeCqlValue(value: string): string {
	const jsonString = JSON.stringify(value);
	return jsonString.slice(1, -1);
}
