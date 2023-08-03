import { BackendApp } from './BackendApp.js'
import { packLayer } from './helpers/lambdas/packLayer.js'
import { packBackendLambdas } from './packBackendLambdas.js'
import { STS } from '@aws-sdk/client-sts'
import { env } from './helpers/env.js'
import { DescribeEndpointCommand, IoTClient } from '@aws-sdk/client-iot'

const sts = new STS({})

const accountEnv = await env({ sts })

const iot = new IoTClient({})
const endpoint = (
	await iot.send(
		new DescribeEndpointCommand({
			endpointType: 'iot:Data-ATS',
		}),
	)
).endpointAddress
if (endpoint === undefined) throw new Error(`IoT endpoint is not found`)

const packagesInLayer: string[] = [
	'@nordicsemiconductor/from-env',
	'mqtt',
	'@middy/core',
]
new BackendApp({
	lambdaSources: await packBackendLambdas(),
	layer: await packLayer({
		id: 'baseLayer',
		dependencies: packagesInLayer,
	}),
	iotEndpoint: endpoint,
	env: accountEnv,
	isTest: process.env.IS_TEST === '1',
})
