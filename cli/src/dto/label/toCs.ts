import type Label from '../../cs/labels/Label.js';
import type NormalizedLabel from './NormalizedLabel.js';

export default function toCs(normalized: NormalizedLabel): Label {
	const { uid, name, parent, content_types } = normalized.label;

	return {
		name,
		uid,
		...(parent && parent.length > 0 ? { parent } : {}),
		...(content_types && content_types.length > 0 ? { content_types } : {}),
	};
}
