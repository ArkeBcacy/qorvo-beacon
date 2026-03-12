import type Label from '#cli/cs/labels/Label.js';
import type NormalizedLabel from '#cli/dto/label/NormalizedLabel.js';

export default interface LabelCollection {
	readonly byUid: ReadonlyMap<Label['uid'], NormalizedLabel>;
	create(normalized: NormalizedLabel): Promise<void>;
	remove(normalized: NormalizedLabel): Promise<void>;
	update(normalized: NormalizedLabel): Promise<void>;
}
