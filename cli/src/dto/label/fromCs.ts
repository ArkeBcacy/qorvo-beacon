import type Label from '../../cs/labels/Label.js';
import type NormalizedLabel from './NormalizedLabel.js';

// Justification: The keys of these objects are ordered carefully to produce
// a readable and stable serialization.

export default function fromCs(label: Label): NormalizedLabel {
	return { label: transformLabel(label) };
}

function transformLabel({
	name,
	parent,
	content_types,
}: Label): NormalizedLabel['label'] {
	return {
		name,
		...(parent && parent.length > 0 ? { parent } : {}),
		...(content_types && content_types.length > 0 ? { content_types } : {}),
	};
}
