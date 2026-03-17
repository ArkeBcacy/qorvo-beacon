import type Client from '#cli/cs/api/Client.js';
import indexLabels from '#cli/cs/labels/index.js';
import type Label from '#cli/cs/labels/Label.js';
import fromCs from '#cli/dto/label/fromCs.js';
import type NormalizedLabel from '#cli/dto/label/NormalizedLabel.js';

export default async function indexCs(client: Client): Promise<{
	labels: ReadonlyMap<string, NormalizedLabel>;
	uidByName: ReadonlyMap<string, Label['uid']>;
}> {
	const raw = await indexLabels(client);
	const labels = new Map<string, NormalizedLabel>();
	const uidByName = new Map<string, Label['uid']>();

	for (const label of raw.values()) {
		labels.set(label.name, fromCs(label));
		uidByName.set(label.name, label.uid);
	}

	return { labels, uidByName };
}
