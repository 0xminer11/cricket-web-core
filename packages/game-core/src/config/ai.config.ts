export const AI_DIFFICULTY = {
  rookie: { decisionNoise: .18, executionVariance: .16, riskDiscipline: .70, tacticalMemory: 2 },
  amateur: { decisionNoise: .12, executionVariance: .12, riskDiscipline: .78, tacticalMemory: 4 },
  pro: { decisionNoise: .07, executionVariance: .08, riskDiscipline: .86, tacticalMemory: 8 },
  elite: { decisionNoise: .04, executionVariance: .05, riskDiscipline: .92, tacticalMemory: 12 },
} as const;
