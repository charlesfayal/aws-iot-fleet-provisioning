import {
	AttachPolicyCommand,
	CertificateStatus,
	CreateKeysAndCertificateCommand,
	CreatePolicyCommand,
	DeleteCertificateCommand,
	DeletePolicyCommand,
	DetachPolicyCommand,
	IoTClient,
	ListTargetsForPolicyCommand,
	UpdateCertificateCommand,
} from '@aws-sdk/client-iot'
import chalk from 'chalk'
import { STACK_NAME } from '../../cdk/stacks/stackConfig.js'
import { isString } from '../../util/isString.js'
import type { CommandDefinition } from './CommandDefinition.js'
import type { Environment } from 'aws-cdk-lib'
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { getProvisionSettings } from '../../settings/settings.js'
import type { SSMClient } from '@aws-sdk/client-ssm'

export const generateClaimCertificate = ({
	iot,
	ssm,
	env,
}: {
	iot: IoTClient
	ssm: SSMClient
	env: Required<Environment>
}): CommandDefinition => ({
	command: 'generate-claim-certificate',
	options: [
		{
			flags: '-X, --remove',
			description: `remove claim certificate`,
		},
	],
	action: async ({ remove }) => {
		const stackName = STACK_NAME

		if (remove === true) {
			const policyName = `${stackName}-claim-policy`
			const targets = await iot.send(
				new ListTargetsForPolicyCommand({
					policyName,
				}),
			)
			for (const target of targets.targets ?? []) {
				console.debug(
					chalk.magenta(`Detaching "${policyName}" policy from ${target}`),
				)
				await iot.send(
					new DetachPolicyCommand({
						policyName,
						target,
					}),
				)
				const certificateId = target.split('/')[1]
				console.debug(
					chalk.magenta(`De-activating certificate "${certificateId}"`),
				)
				await iot.send(
					new UpdateCertificateCommand({
						certificateId,
						newStatus: CertificateStatus.INACTIVE,
					}),
				)
				console.debug(chalk.magenta(`Deleting certificate "${certificateId}"`))
				await iot.send(
					new DeleteCertificateCommand({
						certificateId,
						forceDelete: true,
					}),
				)
			}
			console.debug(chalk.magenta(`Deleting "${policyName}" policy`))
			await iot.send(
				new DeletePolicyCommand({
					policyName,
				}),
			)

			return
		}

		const provisionSettings = await getProvisionSettings({
			ssm,
			stackName,
		})()
		const topic = provisionSettings.topic
		const policyName = `${stackName}-claim-policy`
		console.debug(chalk.magenta(`Creating policy`), chalk.blue(policyName))
		await iot.send(
			new CreatePolicyCommand({
				policyDocument: JSON.stringify({
					Version: '2012-10-17',
					Statement: [
						{ Effect: 'Allow', Action: 'iot:connect', Resource: '*' },
						{
							Effect: 'Allow',
							Action: ['iot:Publish', 'iot:Receive'],
							Resource: [
								`arn:aws:iot:${env.region}:${env.account}:topic/${topic}/\${iot:ClientId}/*`,
							],
						},
						{
							Effect: 'Allow',
							Action: 'iot:Subscribe',
							Resource: [
								`arn:aws:iot:${env.region}:${env.account}:topicfilter/${topic}/\${iot:ClientId}/*`,
							],
						},
					],
				}),
				policyName,
			}),
		)

		console.debug(chalk.magenta(`Creating IoT certificate`))
		const credentials = await iot.send(
			new CreateKeysAndCertificateCommand({
				setAsActive: true,
			}),
		)

		console.debug(chalk.magenta(`Attaching policy to IoT certificate`))
		await iot.send(
			new AttachPolicyCommand({
				policyName,
				target: credentials.certificateArn,
			}),
		)

		if (
			!isString(credentials.certificatePem) ||
			!isString(credentials.keyPair?.PrivateKey) ||
			!isString(credentials.certificateArn)
		) {
			throw new Error(`Failed to create certificate!`)
		}

		const dir = path.join(process.cwd(), 'certificates')
		await mkdir(dir, { recursive: true })
		await Promise.all([
			writeFile(path.join(dir, 'claim.pem'), credentials.certificatePem),
			writeFile(
				path.join(dir, 'claim.key'),
				credentials.keyPair?.PrivateKey ?? '',
			),
			writeFile(
				path.join(dir, 'claim.pub'),
				credentials.keyPair?.PublicKey ?? '',
			),
		])
	},
	help: 'Creates claim credentials',
})
