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
import { putSettings, Scope, deleteSettings } from '../../util/settings.js'
import {
	getLambdaClaimSettings,
	getProvisionSettings,
} from '../../settings/settings.js'
import type { SSMClient } from '@aws-sdk/client-ssm'

export const generateLambdaProvisionCertificate = ({
	iot,
	ssm,
	env,
}: {
	iot: IoTClient
	ssm: SSMClient
	env: Required<Environment>
}): CommandDefinition => ({
	command: 'generate-lambda-provision-certificate <topic> <templateName>',
	options: [
		{
			flags: '-X, --remove',
			description: `remove lambda claim certificate`,
		},
	],
	action: async (topic, templateName, { remove }) => {
		const stackName = STACK_NAME
		// Make it slashless
		topic = topic.replace(/\/$/, '')

		if (remove === true) {
			const policyName = `${stackName}-lambda-provision-policy`
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
			try {
				await iot.send(
					new DeletePolicyCommand({
						policyName,
					}),
				)
			} catch (error) {
				// ignore error
			}

			console.debug(chalk.magenta(`Deleting certificate parameters`))
			const claim = await getLambdaClaimSettings({
				ssm,
				stackName,
			})()
			await Promise.all(
				Object.keys(claim).map(async (key) =>
					deleteSettings({
						ssm,
						stackName,
						scope: Scope.LAMBDA_CLAIM_CERTIFICATE,
					})({ property: key }),
				),
			)

			const provision = await getProvisionSettings({
				ssm,
				stackName,
			})()
			await Promise.all(
				Object.keys(provision).map(async (key) =>
					deleteSettings({
						ssm,
						stackName,
						scope: Scope.PROVISION,
					})({ property: key }),
				),
			)

			return
		}

		const policyName = `${stackName}-lambda-provision-policy`
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
								`arn:aws:iot:${env.region}:${env.account}:topic/$aws/certificates/create/*`,
								`arn:aws:iot:${env.region}:${env.account}:topic/$aws/provisioning-templates/${templateName}/provision/*`,
								`arn:aws:iot:${env.region}:${env.account}:topic/${topic}/*`,
							],
						},
						{
							Effect: 'Allow',
							Action: 'iot:Subscribe',
							Resource: [
								`arn:aws:iot:${env.region}:${env.account}:topicfilter/$aws/certificates/create/*`,
								`arn:aws:iot:${env.region}:${env.account}:topicfilter/$aws/provisioning-templates/${templateName}/provision/*`,
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

		await Promise.all([
			putSettings({
				ssm,
				stackName,
				scope: Scope.LAMBDA_CLAIM_CERTIFICATE,
			})({ property: 'certificate', value: credentials.certificatePem ?? '' }),
			putSettings({
				ssm,
				stackName,
				scope: Scope.LAMBDA_CLAIM_CERTIFICATE,
			})({
				property: 'privateKey',
				value: credentials.keyPair?.PrivateKey ?? '',
			}),
			putSettings({
				ssm,
				stackName,
				scope: Scope.PROVISION,
			})({
				property: 'topic',
				value: topic,
			}),
			putSettings({
				ssm,
				stackName,
				scope: Scope.PROVISION,
			})({
				property: 'templateName',
				value: templateName,
			}),
		])
	},
	help: 'Creates lambda claim credentials',
})
