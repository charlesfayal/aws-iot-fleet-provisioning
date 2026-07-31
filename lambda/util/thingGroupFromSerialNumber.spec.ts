import assert from 'node:assert/strict'
import { describe, test as it } from 'node:test'
import { thingGroupFromSerialNumber } from './thingGroupFromSerialNumber.js'

void describe('thingGroupFromSerialNumber()', () => {
	void it('should derive the building monitor group from the board version', () =>
		assert.equal(
			thingGroupFromSerialNumber('202607AA01030001'),
			'nowi_boards_v1_3',
		))

	void it('should derive the pipe monitor group from the board version', () =>
		assert.equal(
			thingGroupFromSerialNumber('202607AA00041001'),
			'pipe_monitor_boards_v0_4',
		))

	void it('should strip leading zeros from the version', () =>
		assert.equal(
			thingGroupFromSerialNumber('202612BC10120042'),
			'nowi_boards_v10_12',
		))

	void it('should fall back to the latest building monitor group for legacy serial numbers', () =>
		assert.equal(thingGroupFromSerialNumber('0042'), 'nowi_boards_v1_3'))

	void it('should fall back to the latest pipe monitor group for legacy serial numbers', () =>
		assert.equal(
			thingGroupFromSerialNumber('1042'),
			'pipe_monitor_boards_v0_4',
		))

	void it('should fall back to the default group for unknown serial numbers', () => {
		assert.equal(thingGroupFromSerialNumber(undefined), 'nowi_boards_v1_3')
		assert.equal(thingGroupFromSerialNumber('not-a-serial'), 'nowi_boards_v1_3')
	})
})
