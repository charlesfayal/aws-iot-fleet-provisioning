export const STACK_NAME = process.env.STACK_NAME ?? 'fleet-provision'
export const CI_STACK_NAME = process.env.STACK_NAME ?? `${STACK_NAME}-ci`
export const TEST_RESOURCES_STACK_NAME = `${STACK_NAME}-test`
