import type { BackendLambdas } from './BackendLambdas.js'
import { packLambdaFromPath } from './helpers/lambdas/packLambdaFromPath.js'

export const packBackendLambdas = async (): Promise<BackendLambdas> => ({
	provision: await packLambdaFromPath('provision', 'lambda/provision.ts'),
})
