/**
 * Normalizes folder names by replacing spaces with underscores.
 * This prevents issues with Contentstack's folder structure requirements
 * where parent folders with spaces may not exist during asset push.
 *
 * @param name - The folder name from Contentstack
 * @returns The normalized folder name with spaces replaced by underscores
 */
export default function normalizeFolderName(name: string): string {
	return name.replace(/\s+/gu, '_');
}
