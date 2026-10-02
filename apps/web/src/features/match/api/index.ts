import { createMatchClient } from './match-client';

export * from './match-client';
export const matchClient = createMatchClient(process.env.NEXT_PUBLIC_API_URL);
