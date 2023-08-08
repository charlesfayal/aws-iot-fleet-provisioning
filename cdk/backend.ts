import { BackendApp } from './BackendApp.js'
import { packLayer } from './helpers/lambdas/packLayer.js'
import { packBackendLambdas } from './packBackendLambdas.js'
import { DescribeEndpointCommand, IoTClient } from '@aws-sdk/client-iot'

const iot = new IoTClient({})
const endpoint = (
	await iot.send(
		new DescribeEndpointCommand({
			endpointType: 'iot:Data-ATS',
		}),
	)
).endpointAddress
if (endpoint === undefined) throw new Error(`IoT endpoint is not found`)

const packagesInLayer: string[] = ['@nordicsemiconductor/from-env', 'mqtt']
new BackendApp({
	lambdaSources: await packBackendLambdas(),
	layer: await packLayer({
		id: 'baseLayer',
		dependencies: packagesInLayer,
	}),
	iotEndpoint: endpoint,
})
