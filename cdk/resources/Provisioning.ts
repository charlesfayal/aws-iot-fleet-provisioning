import {
	Duration,
	aws_iam as IAM,
	aws_lambda as Lambda,
	aws_logs as Logs,
	Stack,
	aws_iot as IoT,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { PackedLambda } from '../helpers/lambdas/packLambda.js'
import { LambdaSource } from './LambdaSource.js'
import { Effect } from 'aws-cdk-lib/aws-iam'
import { IoTActionRole } from './IoTActionRole.js'
import { Scope, settingsPath } from '../../util/settings.js'
import { StringParameter } from 'aws-cdk-lib/aws-ssm'
import { STACK_NAME } from '../stacks/stackConfig.js'

export class Provisioning extends Construct {
	public constructor(
		parent: Construct,
		{
			layers,
			lambdaSources,
			iotEndpoint,
		}: {
			layers: Lambda.ILayerVersion[]
			lambdaSources: {
				provision: PackedLambda
			}
			iotEndpoint: string
		},
	) {
		super(parent, 'provision')

		const provisionTopic = StringParameter.fromStringParameterName(
			this,
			'provisionTopic',
			settingsPath({
				stackName: STACK_NAME,
				scope: Scope.PROVISION,
				property: 'topic',
			}),
		)
		const provisionTemplateName = StringParameter.fromStringParameterName(
			this,
			'provisionTemplateName',
			settingsPath({
				stackName: STACK_NAME,
				scope: Scope.PROVISION,
				property: 'templateName',
			}),
		)

		// Lambda functions
		const provision = new Lambda.Function(this, 'provision', {
			handler: lambdaSources.provision.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_18_X,
			timeout: Duration.seconds(15),
			memorySize: 1792,
			code: new LambdaSource(this, lambdaSources.provision).code,
			description: 'Device certificate provision',
			environment: {
				VERSION: this.node.tryGetContext('version'),
				LOG_LEVEL: this.node.tryGetContext('logLevel'),
				NODE_NO_WARNINGS: '1',
				STACK_NAME: Stack.of(this).stackName,
				TEMPLATE_NAME: provisionTemplateName.stringValue,
				IOT_ENDPOINT: iotEndpoint,
				PROVISION_TOPIC: provisionTopic.stringValue,
			},
			initialPolicy: [
				new IAM.PolicyStatement({
					effect: Effect.ALLOW,
					actions: ['ssm:GetParametersByPath'],
					resources: [
						`arn:aws:ssm:${Stack.of(this).region}:${
							Stack.of(this).account
						}:parameter/${Stack.of(this).stackName}/${
							Scope.LAMBDA_CLAIM_CERTIFICATE
						}`,
					],
				}),
			],
			layers,
			logRetention: Logs.RetentionDays.ONE_DAY,
		})

		const rule = new IoT.CfnTopicRule(this, 'topicRule', {
			topicRulePayload: {
				description: `Forward provision request to lambda`,
				ruleDisabled: false,
				awsIotSqlVersion: '2016-03-23',
				sql: `
					select
						* as message,
						topic() as topic,
						timestamp() as timestamp
					from '${provisionTopic.stringValue}/+/json'
				`,
				actions: [
					{
						lambda: {
							functionArn: provision.functionArn,
						},
					},
				],
				errorAction: {
					republish: {
						roleArn: new IoTActionRole(this).roleArn,
						topic: 'errors',
					},
				},
			},
		})

		provision.addPermission('topicRule', {
			principal: new IAM.ServicePrincipal('iot.amazonaws.com'),
			sourceArn: rule.attrArn,
		})
	}
}
