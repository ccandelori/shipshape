export class AtRiskWeekNodeContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AtRiskWeekNodeContractError';
  }
}
