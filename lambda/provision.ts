import middy from '@middy/core'
import { logger } from './util/logger.js'
import mqtt, { MqttClient } from 'mqtt'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { defer } from './util/defer.js'
import { getSettings, Scope } from '../util/settings.js'
import { SSMClient } from '@aws-sdk/client-ssm'

const log = logger('provision')
const ssm = new SSMClient({})

const { templateName, provisionTopic, endpoint, stackName } = fromEnv({
	stackName: 'STACK_NAME',
	templateName: 'TEMPLATE_NAME',
	provisionTopic: 'PROVISION_TOPIC',
	endpoint: 'IOT_ENDPOINT',
})(process.env)

const lambdaClaimCertificate = await getSettings<{
	certificate: string
	privateKey: string
}>({
	ssm,
	stackName,
	scope: Scope.LAMBDA_CLAIM_CERTIFICATE,
})()

const amazonRootCA1 =
	'-----BEGIN CERTIFICATE-----\n' +
	'MIIDQTCCAimgAwIBAgITBmyfz5m/jAo54vB4ikPmljZbyjANBgkqhkiG9w0BAQsF\n' +
	'ADA5MQswCQYDVQQGEwJVUzEPMA0GA1UEChMGQW1hem9uMRkwFwYDVQQDExBBbWF6\n' +
	'b24gUm9vdCBDQSAxMB4XDTE1MDUyNjAwMDAwMFoXDTM4MDExNzAwMDAwMFowOTEL\n' +
	'MAkGA1UEBhMCVVMxDzANBgNVBAoTBkFtYXpvbjEZMBcGA1UEAxMQQW1hem9uIFJv\n' +
	'b3QgQ0EgMTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALJ4gHHKeNXj\n' +
	'ca9HgFB0fW7Y14h29Jlo91ghYPl0hAEvrAIthtOgQ3pOsqTQNroBvo3bSMgHFzZM\n' +
	'9O6II8c+6zf1tRn4SWiw3te5djgdYZ6k/oI2peVKVuRF4fn9tBb6dNqcmzU5L/qw\n' +
	'IFAGbHrQgLKm+a/sRxmPUDgH3KKHOVj4utWp+UhnMJbulHheb4mjUcAwhmahRWa6\n' +
	'VOujw5H5SNz/0egwLX0tdHA114gk957EWW67c4cX8jJGKLhD+rcdqsq08p8kDi1L\n' +
	'93FcXmn/6pUCyziKrlA4b9v7LWIbxcceVOF34GfID5yHI9Y/QCB/IIDEgEw+OyQm\n' +
	'jgSubJrIqg0CAwEAAaNCMEAwDwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMC\n' +
	'AYYwHQYDVR0OBBYEFIQYzIU07LwMlJQuCFmcx7IQTgoIMA0GCSqGSIb3DQEBCwUA\n' +
	'A4IBAQCY8jdaQZChGsV2USggNiMOruYou6r4lK5IpDB/G/wkjUu0yKGX9rbxenDI\n' +
	'U5PMCCjjmCXPI6T53iHTfIUJrU6adTrCC2qJeHZERxhlbI1Bjjt/msv0tadQ1wUs\n' +
	'N+gDS63pYaACbvXy8MWy7Vu33PqUXHeeE6V/Uq2V8viTO96LXFvKWlJbYK8U90vv\n' +
	'o/ufQJVtMVT8QtPHRh8jrdkPSHCa2XV4cdFyQzR1bldZwgJcJmApzyMZFo6IQ6XU\n' +
	'5MsI+yMRQ+hDKXJioaldXgjUkK642M4UwtBV8ob2xJNDd2ZhwLnoQdeXeGADbkpy\n' +
	'rqXRfboQnoZsG4q5WTP468SQvvG5\n' +
	'-----END CERTIFICATE-----\n'

type ErrorMessage = {
	statusCode: number
	errorCode?: string
	errorMessage?: string
}

type ProvisionResponse = {
	certificates: CreateKeysAndCertificateResponse
	thing: RegisterThingResponse
}

type CreateKeysAndCertificateResponse = {
	certificateId: string
	certificatePem: string
	privateKey: string
	certificateOwnershipToken: string
}

type RegisterThingResponse = {
	deviceConfiguration: Record<string, string>
	thingName: string
}

const provisionCertificate = async ({
	client,
	parameters,
}: {
	client: MqttClient
	parameters: Record<string, unknown>
}): Promise<ProvisionResponse> => {
	const { promise, resolve, reject } = defer<ProvisionResponse>(10000)
	let result: ProvisionResponse

	client
		.on('connect', () => {
			client.subscribe([
				`$aws/certificates/create/json/accepted`,
				`$aws/certificates/create/json/rejected`,
				`$aws/provisioning-templates/${templateName}/provision/json/accepted`,
				`$aws/provisioning-templates/${templateName}/provision/json/rejected`,
			])

			client.publish('$aws/certificates/create/json', JSON.stringify({}))
		})
		.on('error', (error) => {
			log.error(`mqtt error`, { error })
		})
		.on('message', (topic, message) => {
			const data = JSON.parse(message.toString())
			if (topic.includes('rejected')) {
				log.error(`Certificate rejected`, { data })
				return reject(new Error((data as ErrorMessage).errorMessage))
			}

			switch (topic.split('/')?.[1]) {
				case 'certificates':
					result = {
						...result,
						certificates: data,
					}
					client.publish(
						`$aws/provisioning-templates/${templateName}/provision/json`,
						JSON.stringify({
							certificateOwnershipToken: data.certificateOwnershipToken,
							parameters,
						}),
					)
					break
				case 'provisioning-templates':
					result = {
						...result,
						thing: data,
					}
					resolve(result)
					break
				default:
					return reject(new Error(`Unknown topic: ${topic}`))
			}
		})

	client.connect()
	return promise
}

const h = async (event: {
	message: Record<string, unknown>
	topic: string
	timestamp: number
}) => {
	log.debug(`event`, { event })

	const clientId = event.topic.replace(provisionTopic, '').split('/')?.[1] ?? ''
	const client = mqtt.connect({
		host: endpoint,
		port: 8883,
		protocol: 'mqtts',
		key: lambdaClaimCertificate.privateKey,
		cert: lambdaClaimCertificate.certificate,
		ca: amazonRootCA1,
		reconnectPeriod: 0,
		manualConnect: true,
	})

	try {
		const thing = await provisionCertificate({
			client,
			parameters: event.message,
		})

		// Break messages into smaller chunks
		log.debug(`publish result on topic: ${provisionTopic}/${clientId}/accepted`)
		client.publish(
			`${provisionTopic}/${clientId}/accepted`,
			JSON.stringify({
				privateKey: thing.certificates.privateKey,
			}),
		)
		client.publish(
			`${provisionTopic}/${clientId}/accepted`,
			JSON.stringify({
				certificatePem: thing.certificates.certificatePem,
			}),
		)
	} catch (error) {
		client.publish(
			`${provisionTopic}/${clientId}/rejected`,
			JSON.stringify({
				error: (error as Error).message,
			}),
		)
	} finally {
		log.debug(`closing mqtt`)
		client.end()
	}
}

export const handler = middy(h)
