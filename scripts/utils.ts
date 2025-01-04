export function displaySize(bytes: number) {
	const NUMBER_FORMATTER = new Intl.NumberFormat("en", {
		maximumFractionDigits: 2,
		minimumFractionDigits: 2,
	});

	return `${NUMBER_FORMATTER.format(bytes / 1000)} kB`;
}
