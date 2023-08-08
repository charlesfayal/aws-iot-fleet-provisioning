import { App, aws_lambda as Lambda, Stack } from 'aws-cdk-lib'
import type { BackendLambdas } from '../BackendLambdas.js'
import type { PackedLayer } from '../helpers/lambdas/packLayer.js'
import { STACK_NAME } from './stackConfig.js'
import { LambdaSource } from '../resources/LambdaSource.js'
import { Provisioning } from '../resources/Provisioning.js'
import { Fleet } from '../resources/Fleet.js'

export class BackendStack extends Stack {
	public constructor(
		parent: App,
		{
			lambdaSources,
			layer,
			iotEndpoint,
		}: {
			lambdaSources: BackendLambdas
			layer: PackedLayer
			iotEndpoint: string
		},
	) {
		super(parent, STACK_NAME)

		const baseLayer = new Lambda.LayerVersion(this, 'baseLayer', {
			code: new LambdaSource(this, {
				id: 'baseLayer',
				zipFile: layer.layerZipFile,
				hash: layer.hash,
			}).code,
			compatibleArchitectures: [Lambda.Architecture.ARM_64],
			compatibleRuntimes: [Lambda.Runtime.NODEJS_18_X],
		})
		const powerToolLayer = Lambda.LayerVersion.fromLayerVersionArn(
			this,
			'powertoolsLayer',
			`arn:aws:lambda:${
				Stack.of(this).region
			}:094274105915:layer:AWSLambdaPowertoolsTypeScript:7`,
		)

		const lambdaLayers: Lambda.ILayerVersion[] = [baseLayer, powerToolLayer]

		new Fleet(this)

		new Provisioning(this, {
			lambdaSources,
			layers: lambdaLayers,
			iotEndpoint,
		})
	}
}
