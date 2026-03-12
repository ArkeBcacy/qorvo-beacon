import type Client from '../api/Client.js';

export default async function deleteLabel(
	client: Client,
	labelUid: string,
): Promise<void> {
	await client.DELETE('/v3/labels/{label_uid}', {
		params: { path: { label_uid: labelUid } },
	});
}
