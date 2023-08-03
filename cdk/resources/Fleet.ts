import { aws_iam as IAM, Stack, aws_iot as IoT } from 'aws-cdk-lib'
import { StringParameter } from 'aws-cdk-lib/aws-ssm'
import { Construct } from 'constructs'
import { Scope, settingsPath } from '../../util/settings.js'
import { STACK_NAME } from '../stacks/stackConfig.js'

export class Fleet extends Construct {
	public readonly template: IoT.CfnProvisioningTemplate
	public constructor(parent: Construct) {
		super(parent, 'fleet')

		const templateNameParameter = StringParameter.fromStringParameterName(
			this,
			'templateNameParameter',
			settingsPath({
				stackName: STACK_NAME,
				scope: Scope.PROVISION,
				property: 'templateName',
			}),
		)

		const role = new IAM.Role(this, 'role', {
			assumedBy: new IAM.ServicePrincipal('iot.amazonaws.com'),
			managedPolicies: [
				IAM.ManagedPolicy.fromManagedPolicyArn(
					this,
					'AWSIoTThingsRegistration',
					'arn:aws:iam::aws:policy/service-role/AWSIoTThingsRegistration',
				),
			],
		})

		this.template = new IoT.CfnProvisioningTemplate(this, 'fleet', {
			provisioningRoleArn: role.roleArn,
			enabled: true,
			templateName: templateNameParameter.stringValue,
			templateBody: JSON.stringify({
				Parameters: {
					SerialNumber: {
						Type: 'String',
					},
					'AWS::IoT::Certificate::Id': {
						Type: 'String',
					},
				},
				Resources: {
					policy: {
						Type: 'AWS::IoT::Policy',
						Properties: {
							PolicyDocument: {
								Version: '2012-10-17',
								Statement: [
									{
										Effect: 'Allow',
										Action: ['iot:connect'],
										Resource: ['*'],
									},
									{
										Effect: 'Allow',
										Action: ['iot:publish', 'iot:receive'],
										Resource: [
											`arn:aws:iot:${Stack.of(this).region}:${
												Stack.of(this).account
											}:topic/any/topic/for/device/*`,
										],
									},
									{
										Effect: 'Allow',
										Action: ['iot:subscribe'],
										Resource: [
											`arn:aws:iot:${Stack.of(this).region}:${
												Stack.of(this).account
											}:topicfilter/any/topic/for/device/*`,
										],
									},
								],
							},
						},
					},
					certificate: {
						Type: 'AWS::IoT::Certificate',
						Properties: {
							CertificateId: {
								Ref: 'AWS::IoT::Certificate::Id',
							},
							Status: 'Active',
						},
					},
				},
			}),
		})
	}
}
