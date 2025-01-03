let instCount = 0;

export function instanceId(): symbol {
	return Symbol(`inject.instance ${instCount++}`);
}
