export const AI_DIFFICULTY = {
  rookie: {
    decisionNoise: 0.18,
    executionVariance: 0.16,
    riskDiscipline: 0.7,
    tacticalMemory: 2,
  },
  amateur: {
    decisionNoise: 0.12,
    executionVariance: 0.12,
    riskDiscipline: 0.78,
    tacticalMemory: 4,
  },
  pro: {
    decisionNoise: 0.07,
    executionVariance: 0.08,
    riskDiscipline: 0.86,
    tacticalMemory: 8,
  },
  elite: {
    decisionNoise: 0.04,
    executionVariance: 0.05,
    riskDiscipline: 0.92,
    tacticalMemory: 12,
  },
} as const;
