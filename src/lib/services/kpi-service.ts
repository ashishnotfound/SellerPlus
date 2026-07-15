/**
 * SellerPlus OS — KPI Service Layer
 * 
 * Provides deterministic mathematical formulas for business KPIs.
 * The AI MUST NOT calculate these metrics inside prompts. The LLM 
 * should receive the output of these verified functions.
 */

export class KPIService {
  
  /**
   * Calculates ACOS (Advertising Cost of Sales)
   * ACOS = (Ad Spend / Ad Sales) * 100
   */
  static calculateACOS(spend: number, adSales: number): number {
    if (adSales === 0) return spend > 0 ? 100 : 0;
    return (spend / adSales) * 100;
  }

  /**
   * Calculates ROAS (Return on Ad Spend)
   * ROAS = (Ad Sales / Ad Spend)
   */
  static calculateROAS(spend: number, adSales: number): number {
    if (spend === 0) return adSales > 0 ? 999 : 0; // Infinite/high ROAS
    return adSales / spend;
  }

  /**
   * Calculates TACOS (Total Advertising Cost of Sales)
   * TACOS = (Ad Spend / Total Sales) * 100
   */
  static calculateTACOS(spend: number, totalSales: number): number {
    if (totalSales === 0) return spend > 0 ? 100 : 0;
    return (spend / totalSales) * 100;
  }

  /**
   * Calculates Gross Profit
   * Profit = Total Revenue - (COGS + Amazon Fees + Ad Spend + Refunds/Misc)
   */
  static calculateProfit(revenue: number, cogs: number, fees: number, adSpend: number, otherCosts: number = 0): number {
    return revenue - (cogs + fees + adSpend + otherCosts);
  }

  /**
   * Calculates Profit Margin
   * Margin = (Gross Profit / Total Revenue) * 100
   */
  static calculateMargin(profit: number, revenue: number): number {
    if (revenue === 0) return 0;
    return (profit / revenue) * 100;
  }

  /**
   * Calculates Inventory Velocity (units sold per day over a period)
   */
  static calculateInventoryVelocity(unitsSold: number, days: number): number {
    if (days === 0) return 0;
    return unitsSold / days;
  }

  /**
   * Calculates Days of Supply (Restock Days)
   */
  static calculateRestockDays(currentInventory: number, dailyVelocity: number): number {
    if (dailyVelocity === 0) return 999;
    return currentInventory / dailyVelocity;
  }

  /**
   * Calculates Conversion Rate
   * CVR = (Total Orders / Total Sessions) * 100
   */
  static calculateConversionRate(orders: number, sessions: number): number {
    if (sessions === 0) return 0;
    return (orders / sessions) * 100;
  }

  /**
   * Calculates Organic Sales Ratio
   * Organic Ratio = (Organic Sales / Total Sales) * 100
   */
  static calculateOrganicSalesRatio(organicSales: number, totalSales: number): number {
    if (totalSales === 0) return 0;
    return (organicSales / totalSales) * 100;
  }

  /**
   * Calculates the overall Business Health Score (0-100) and its components deterministically.
   * AI must not calculate or modify this score.
   */
  static calculateBusinessHealthScore(
    acos: number,
    margin: number,
    inventoryVelocity: number,
    organicRatio: number
  ): { finalScore: number, components: { advertising: number, profitability: number, inventory: number, growth: number } } {
    
    // Advertising Health: Good ACOS is < 30%
    const advertising = Math.min(100, Math.max(0, 100 - (acos > 0 ? Math.max(0, acos - 15) * 1.5 : 0)));
    
    // Profitability Health: Good Margin > 20%
    const profitability = Math.min(100, Math.max(0, margin * 400));
    
    // Inventory Health: Velocity > 5 units/day is solid
    const inventory = Math.min(100, inventoryVelocity * 10);
    
    // Growth/Organic Health: High organic ratio is healthy
    const growth = Math.min(100, organicRatio);

    const finalScore = (advertising * 0.3) + (profitability * 0.4) + (inventory * 0.15) + (growth * 0.15);

    return {
      finalScore: Math.round(finalScore),
      components: {
        advertising: Math.round(advertising),
        profitability: Math.round(profitability),
        inventory: Math.round(inventory),
        growth: Math.round(growth)
      }
    };
  }

  /**
   * Calculates a deterministic confidence score (0-100) based on data completeness and statistical consistency.
   * The AI uses this to rank recommendations rather than hallucinating its own confidence.
   */
  static calculateConfidenceScore(
    dataPointsCount: number,
    missingFieldsCount: number,
    dataAgeDays: number,
    variance: number = 0
  ): number {
    let score = 100;
    
    score -= (missingFieldsCount * 10);
    if (dataAgeDays > 30) score -= 20;
    else if (dataAgeDays > 7) score -= 10;
    
    if (dataPointsCount < 5) score -= 25;
    else if (dataPointsCount < 30) score -= 10;

    if (variance > 0.5) score -= 15;

    return Math.max(0, Math.min(100, score));
  }
}
