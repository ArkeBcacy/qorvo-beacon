import type Client from '#cli/cs/api/Client.js';
import indexLabels from '#cli/cs/labels/index.js';
import fromCs from '#cli/dto/label/fromCs.js';
import type NormalizedLabel from '#cli/dto/label/NormalizedLabel.js';

export default async function indexCs(
	client: Client,
): Promise<ReadonlyMap<string, NormalizedLabel>> {
	const raw = await indexLabels(client);
	const transformed = new Map<string, NormalizedLabel>();

	for (const label of raw.values()) {
		transformed.set(label.uid, fromCs(label));
	}

	return transformed;
}
