import chalk from 'chalk'
import mqtt, { MqttClient } from 'mqtt'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { CommandDefinition } from './CommandDefinition.js'
import { DescribeEndpointCommand, type IoTClient } from '@aws-sdk/client-iot'
import { getProvisionSettings } from '../../settings/settings.js'
import { randomUUID } from 'node:crypto'
import type { SSMClient } from '@aws-sdk/client-ssm'
import { EventEmitter } from 'node:events'

type EventCallback = (...args: any[]) => void

export const simulateDeviceCommand = ({
	iot,
	ssm,
	stackName,
}: {
	iot: IoTClient
	ssm: SSMClient
	stackName: string
}): CommandDefinition => ({
	command: 'simulate-device',
	action: async () => {
		const dir = path.join(process.cwd(), 'certificates')
		const claimCertificateLocation = path.join(dir, 'claim.pem')
		const claimPrivateKeyLocation = path.join(dir, 'claim.key')

		const endpoint =
			(
				await iot.send(
					new DescribeEndpointCommand({
						endpointType: 'iot:Data-ATS',
					}),
				)
			).endpointAddress ?? ''

		// Claim private key
		console.log(
			chalk.yellow('Private key:'),
			chalk.blue(claimPrivateKeyLocation),
		)
		// Claim certificate
		console.log(
			chalk.yellow('Certificate:'),
			chalk.blue(claimCertificateLocation),
		)
		// IoT Endpoint
		console.log(chalk.yellow('IoT Endpoint:'), chalk.blue(endpoint))

		console.log()

		const [key, cert, ca] = await Promise.all([
			readFile(claimPrivateKeyLocation, 'utf-8'),
			readFile(claimCertificateLocation, 'utf-8'),
			readFile(path.join(process.cwd(), 'data', 'AmazonRootCA1.pem'), 'utf-8'),
		])

		const provision = await getProvisionSettings({
			ssm,
			stackName,
		})()

		const clientId = randomUUID()
		const connection = await new Promise<{
			on: (event: string, callback: EventCallback) => void
			client: MqttClient
			end: () => Promise<void>
			publish: (topic: string, payload: Record<string, any>) => void
		}>((resolve, reject) => {
			const mqttClient = mqtt.connect({
				host: endpoint,
				port: 8883,
				protocol: 'mqtts',
				protocolVersion: 4,
				clean: true,
				reconnectPeriod: 0,
				clientId,
				key,
				cert,
				ca,
			})

			const endPromise = new Promise<void>((resolve) => {
				mqttClient.on('close', () => {
					console.log(chalk.gray('Disconnected.'))
					resolve()
				})
			})

			const em = new EventEmitter()

			mqttClient.on('connect', () => {
				console.log(chalk.green('connected!'))
				resolve({
					on: (event, cb) => em.on(event, cb),
					client: mqttClient,
					end: async () => {
						mqttClient.end()
						return endPromise
					},
					publish: (topic, payload) => {
						console.debug(
							chalk.blue.dim('>'),
							chalk.gray(`[${new Date().toISOString().slice(11, 19)}]`),
							chalk.blue(topic),
						)
						console.debug(
							chalk.blue.dim('>'),
							chalk.blue(JSON.stringify(payload)),
						)
						mqttClient.publish(topic, JSON.stringify(payload))
					},
				})
			})

			mqttClient.on('error', (err) => {
				reject(err)
			})

			const provisionTopic = `${provision.topic}/${clientId}/accepted`
			console.log(chalk.green(`subscribe: ${provisionTopic}`))
			mqttClient.subscribe(provisionTopic)
			mqttClient.on('message', (topic, payload) => {
				const message = payload.toString()
				console.debug(
					chalk.magenta.dim('<'),
					chalk.gray(`[${new Date().toISOString().slice(11, 19)}]`),
					chalk.magenta(topic),
				)
				console.debug(chalk.magenta.dim('<'), chalk.magenta(message))

				switch (topic) {
					case provisionTopic:
						em.emit('data', JSON.parse(message))
				}
			})
		})

		const quit = async () => {
			console.log(chalk.gray('Closing connection ...'))

			await connection.end()

			process.exit()
		}
		process.on('SIGINT', quit)

		connection.publish(`${provision.topic}/${clientId}/json`, {
			ThingName: 'testDevice',
			SerialNumber: '123456',
		})

		const receivedMessages = new Set<string>()
		connection.on('data', async (message: Record<string, unknown>) => {
			Object.keys(message).forEach((key) => receivedMessages.add(key))
			if (receivedMessages.size === 2) {
				console.log()
				console.log(
					chalk.green(
						`2 messages received. Writing a new certificate to device`,
					),
				)
				await connection.end()
			}
		})
	},
	help: 'Simulates a device',
})
