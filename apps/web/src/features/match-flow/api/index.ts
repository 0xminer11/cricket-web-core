import { createMatchFlowClient } from './match-flow-client';

export * from './match-flow-client';
export const matchFlowClient = createMatchFlowClient(
  process.env.NEXT_PUBLIC_API_URL,
);
