import type BeaconReplacer from '../../BeaconReplacer.js';

export default function processHtmlRteAsset(
	this: BeaconReplacer,
	html: string,
): string {
	// Pattern to match src="{asset: $beacon: 'path/to/asset.jpg'}"
	const beaconPattern = /src="\{asset:\s*\$beacon:\s*'(?<itemPath>[^']+)'\}"/gu;

	return html.replace(beaconPattern, (match) => {
		const execResult =
			/src="\{asset:\s*\$beacon:\s*'(?<itemPath>[^']+)'\}"/u.exec(match);
		const itemPath = execResult?.groups?.itemPath;
		if (!itemPath) {
			return match;
		}
		const asset = this.mapItemPathToAsset(itemPath);

		// Return both asset_uid and src attributes for Contentstack compatibility
		// Use the asset's URL directly from Contentstack
		return `asset_uid="${asset.uid}" src="${asset.url}"`;
	});
}
