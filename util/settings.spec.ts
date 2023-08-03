import type { SSMClient } from '@aws-sdk/client-ssm'
import {
	Scope,
	getSettingsOptional,
	settingsPath,
	getSettings,
} from './settings.js'

describe('getSettingsOptional()', () => {
	it('should return the given default value if parameter does not exist', async () => {
		const stackConfig = getSettingsOptional<
			Record<string, string>,
			Record<string, never>
		>({
			ssm: {
				send: jest.fn().mockResolvedValue({ Parameters: undefined }),
			} as unknown as SSMClient,
			stackName: 'STACK_NAME',
			scope: Scope.LAMBDA_CLAIM_CERTIFICATE,
		})

		const result = await stackConfig({})
		expect(result).toEqual({})
	})
})

describe('settingsPath()', () => {
	it('should produce a fully qualified parameter name', () =>
		expect(
			settingsPath({
				scope: Scope.LAMBDA_CLAIM_CERTIFICATE,
				stackName: 'fleet',
				property: 'someProperty',
			}),
		).toEqual('/fleet/lambdaClaim/someProperty'))

	it('should error for invalid string scope', () => {
		expect(() =>
			settingsPath({
				scope: 'invalidScope',
				stackName: 'fleet',
				property: 'someProperty',
			}),
		).toThrowError()
	})
})

describe('getSettings()', () => {
	it('should return the object with same scope', async () => {
		const returnedValues = [
			{
				Name: `/fleet/lambdaClaim/key1`,
				Value: 'value1',
			},
			{
				Name: `/fleet/lambdaClaim/key2`,
				Value: 'value2',
			},
			{
				Name: `/fleet/lambdaClaim/key3`,
				Value: 'value3',
			},
		]

		const stackConfig = getSettings({
			ssm: {
				send: jest.fn().mockResolvedValue({ Parameters: returnedValues }),
			} as unknown as SSMClient,
			stackName: 'fleet',
			scope: Scope.LAMBDA_CLAIM_CERTIFICATE,
		})

		const result = await stackConfig()
		expect(result).toEqual({
			key1: 'value1',
			key2: 'value2',
			key3: 'value3',
		})
	})
})
