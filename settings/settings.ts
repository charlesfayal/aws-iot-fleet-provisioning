import type { SSMClient } from '@aws-sdk/client-ssm'
import { getSettings, Scope } from '../util/settings.js'

export type LambdaClaimSettings = {
	certificate: string
	privateKey: string
}

export type ProvisionSettings = {
	topic: string
	templateName: string
}

const getScopeSettings = <T>({
	ssm,
	stackName,
	scope,
}: {
	ssm: SSMClient
	stackName: string
	scope: Scope.LAMBDA_CLAIM_CERTIFICATE
}) => {
	const settingsReader = getSettings({
		ssm,
		stackName,
		scope,
	})
	return async (): Promise<T> => {
		const p = await settingsReader()
		const { certificate, privateKey } = p
		if (certificate === undefined) throw new Error(`No certificate configured!`)
		if (privateKey === undefined) throw new Error(`No private key configured!`)

		return {
			certificate,
			privateKey,
		} as T
	}
}

export const getLambdaClaimSettings = ({
	ssm,
	stackName,
}: {
	ssm: SSMClient
	stackName: string
}): (() => Promise<LambdaClaimSettings>) => {
	return getScopeSettings<LambdaClaimSettings>({
		ssm,
		stackName,
		scope: Scope.LAMBDA_CLAIM_CERTIFICATE,
	})
}

export const getProvisionSettings = ({
	ssm,
	stackName,
}: {
	ssm: SSMClient
	stackName: string
}): (() => Promise<ProvisionSettings>) => {
	const scope = Scope.PROVISION
	const settingsReader = getSettings({
		ssm,
		stackName,
		scope,
	})
	return async (): Promise<ProvisionSettings> => {
		const p = await settingsReader()
		const { topic, templateName } = p
		if (topic === undefined) throw new Error(`No provision topic configured!`)
		if (templateName === undefined)
			throw new Error(`No provision tempmlate name configured!`)

		return {
			topic,
			templateName,
		}
	}
}
