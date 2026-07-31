const fallbackThingGroup = 'nowi_boards_v1_3'

/**
 * Serial number format: 202607AA01030001
 * - 202607: production date (YYYYMM)
 * - AA: batch code
 * - 01: board major version
 * - 03: board minor version
 * - 0001: unit number, where the first digit encodes the device type
 *   (0 = building monitor, 1 = pipe monitor)
 */
const serialNumberPattern =
	/^\d{6}[A-Z]{2}(?<major>\d{2})(?<minor>\d{2})(?<type>\d)\d{3}$/

const groupPrefixByType: Record<string, string> = {
	'0': 'nowi_boards',
	'1': 'pipe_monitor_boards',
}

export const thingGroupFromSerialNumber = (serialNumber: unknown): string => {
	if (typeof serialNumber !== 'string') return fallbackThingGroup

	const groups = serialNumberPattern.exec(serialNumber)?.groups
	if (groups !== undefined) {
		const prefix = groupPrefixByType[groups.type as string]
		if (prefix !== undefined) {
			const major = parseInt(groups.major as string, 10)
			const minor = parseInt(groups.minor as string, 10)
			return `${prefix}_v${major}_${minor}`
		}
	}

	// Legacy serial numbers do not encode the board version, so assume the
	// latest revision based on the device type in the last four digits.
	if (/0\d{3}$/.test(serialNumber)) return 'nowi_boards_v1_3'
	if (/1\d{3}$/.test(serialNumber)) return 'pipe_monitor_boards_v0_4'

	return fallbackThingGroup
}
