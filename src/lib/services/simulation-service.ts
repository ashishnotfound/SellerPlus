/**
 * SellerPlus OS — Simulation Service
 * 
 * Provides deterministic bounding for business impact estimations.
 * The AI uses these calculations to explain projected outcomes rather than
 * hallucinating monetary gains.
 */

export interface SimulationResult {
  expectedRevenueImpact: number;
  expectedProfitImpact: number;
  expectedAdvertisingImpact: number;
  assumptions: string[];
}

export interface SimulationScenarios {
  bestCase: SimulationResult;
  expectedCase: SimulationResult;
  worstCase: SimulationResult;
  deterministicFormulaUsed: string;
}

export class SimulationService {
  /**
   * Simulates the impact of pausing a bleeding campaign.
   */
  static simulatePauseCampaign(currentSpend: number, currentSales: number, profitMargin: number = 0.2): SimulationScenarios {
    const waste = Math.max(0, currentSpend - (currentSales * profitMargin));
    
    return {
      bestCase: {
        expectedRevenueImpact: 0, // Assume organic sales absorb the loss
        expectedProfitImpact: currentSpend,
        expectedAdvertisingImpact: -currentSpend,
        assumptions: ["100% of ad sales were cannibalizing organic sales", "Full spend recovered as profit"]
      },
      expectedCase: {
        expectedRevenueImpact: -(currentSales * 0.5), // Lose half the ad sales
        expectedProfitImpact: waste,
        expectedAdvertisingImpact: -currentSpend,
        assumptions: ["50% of ad sales lost", "Net profit increases by the ad waste amount"]
      },
      worstCase: {
        expectedRevenueImpact: -currentSales, // Lose all ad sales
        expectedProfitImpact: currentSpend - (currentSales * profitMargin),
        expectedAdvertisingImpact: -currentSpend,
        assumptions: ["100% of ad sales lost", "No organic recovery"]
      },
      deterministicFormulaUsed: "Waste = Spend - (Sales * Margin)"
    };
  }

  /**
   * Simulates the impact of raising a price.
   */
  static simulatePriceIncrease(currentPrice: number, currentVolume: number, increasePercent: number = 0.1): SimulationScenarios {
    const newPrice = currentPrice * (1 + increasePercent);
    const priceDiff = newPrice - currentPrice;
    
    return {
      bestCase: {
        expectedRevenueImpact: priceDiff * currentVolume,
        expectedProfitImpact: priceDiff * currentVolume,
        expectedAdvertisingImpact: 0,
        assumptions: ["Demand is perfectly inelastic (0% volume drop)"]
      },
      expectedCase: {
        expectedRevenueImpact: (newPrice * (currentVolume * 0.9)) - (currentPrice * currentVolume),
        expectedProfitImpact: (priceDiff * (currentVolume * 0.9)),
        expectedAdvertisingImpact: 0,
        assumptions: ["Demand drops 10%", "Profit still increases due to higher margin"]
      },
      worstCase: {
        expectedRevenueImpact: (newPrice * (currentVolume * 0.6)) - (currentPrice * currentVolume),
        expectedProfitImpact: -((currentPrice * currentVolume * 0.4) * 0.2), // Rough margin loss
        expectedAdvertisingImpact: 0,
        assumptions: ["Demand drops 40%", "Price elasticity is high"]
      },
      deterministicFormulaUsed: "Impact = (NewPrice * ProjectedVolume) - (OldPrice * OldVolume)"
    };
  }

  /**
   * Simulates the impact of restocking inventory to avoid stockout.
   */
  static simulateRestock(dailyVelocity: number, stockoutDaysPrevented: number, unitPrice: number, unitMargin: number): SimulationScenarios {
    const recoveredVolume = dailyVelocity * stockoutDaysPrevented;
    const recoveredRevenue = recoveredVolume * unitPrice;
    const recoveredProfit = recoveredVolume * unitMargin;

    return {
      bestCase: {
        expectedRevenueImpact: recoveredRevenue * 1.2,
        expectedProfitImpact: recoveredProfit * 1.2,
        expectedAdvertisingImpact: 0,
        assumptions: ["Rank improvement leads to 20% higher velocity"]
      },
      expectedCase: {
        expectedRevenueImpact: recoveredRevenue,
        expectedProfitImpact: recoveredProfit,
        expectedAdvertisingImpact: 0,
        assumptions: ["Velocity remains constant"]
      },
      worstCase: {
        expectedRevenueImpact: recoveredRevenue * 0.5,
        expectedProfitImpact: recoveredProfit * 0.5,
        expectedAdvertisingImpact: 0,
        assumptions: ["Demand drops by 50% during restock period"]
      },
      deterministicFormulaUsed: "Impact = DailyVelocity * StockoutDaysPrevented * UnitMetrics"
    };
  }
}
