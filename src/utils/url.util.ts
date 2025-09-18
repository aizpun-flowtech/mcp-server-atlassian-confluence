import { config } from './config.util.js';

const HTTP_REGEX = /^https?:\/\//i;

function getSiteHost(): string | undefined {
	const siteName = config.get('ATLASSIAN_SITE_NAME');
	if (!siteName) {
		return undefined;
	}
	return `https://${siteName}.atlassian.net`;
}

function normalizeBaseUrl(baseUrl?: string): string | undefined {
	const trimmed = baseUrl?.trim();

	if (trimmed && HTTP_REGEX.test(trimmed)) {
		return trimmed.replace(/\/+$/, '');
	}

	const siteHost = getSiteHost();

	if (trimmed) {
		if (siteHost) {
			if (trimmed.startsWith('/')) {
				return `${siteHost}${trimmed}`.replace(/\/+$/, '');
			}

			return `${siteHost}/${trimmed}`.replace(/\/+$/, '');
		}

		return trimmed.replace(/\/+$/, '');
	}

	if (siteHost) {
		return `${siteHost}/wiki`.replace(/\/+$/, '');
	}

	return undefined;
}

function joinBaseAndPath(base: string, path: string): string {
	const sanitizedBase = base.replace(/\/+$/, '');
	if (!path) {
		return sanitizedBase;
	}

	if (HTTP_REGEX.test(path)) {
		return path;
	}

	const trimmedPath = path.trim();

	if (!trimmedPath) {
		return sanitizedBase;
	}

	if (trimmedPath.startsWith('/')) {
		if (
			sanitizedBase.endsWith('/wiki') &&
			trimmedPath.startsWith('/wiki')
		) {
			return `${sanitizedBase}${trimmedPath.replace(/^\/wiki/, '')}`;
		}

		return `${sanitizedBase}${trimmedPath}`;
	}

	let relativePath = trimmedPath;

	if (sanitizedBase.endsWith('/wiki') && relativePath.startsWith('wiki/')) {
		relativePath = relativePath.slice('wiki/'.length);
	}

	return `${sanitizedBase}/${relativePath}`;
}

export function resolveConfluenceBaseUrl(baseUrl?: string): string {
	const normalized = normalizeBaseUrl(baseUrl);
	if (normalized) {
		return normalized;
	}
	return baseUrl?.trim() || '';
}

export function ensureAbsoluteConfluenceUrl(
	urlOrPath: string,
	baseUrl?: string,
): string {
	const trimmedUrl = urlOrPath?.trim() || '';

	if (!trimmedUrl) {
		return trimmedUrl;
	}

	if (HTTP_REGEX.test(trimmedUrl)) {
		return trimmedUrl;
	}

	const siteHost = getSiteHost();
	const candidateBases: (string | undefined)[] = [];

	if (baseUrl && HTTP_REGEX.test(baseUrl)) {
		candidateBases.push(baseUrl);
	} else {
		candidateBases.push(resolveConfluenceBaseUrl(baseUrl));
	}

	if (siteHost) {
		candidateBases.push(`${siteHost}/wiki`);
		candidateBases.push(siteHost);
	}

	const seenBases = new Set<string>();

	for (const candidate of candidateBases) {
		if (!candidate) {
			continue;
		}

		if (seenBases.has(candidate)) {
			continue;
		}

		seenBases.add(candidate);

		const combined = joinBaseAndPath(candidate, trimmedUrl);
		if (combined) {
			return combined;
		}
	}

	return trimmedUrl;
}
