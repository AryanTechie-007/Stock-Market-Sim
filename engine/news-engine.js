import { EventEmitter } from 'events';

/**
 * Dynamic Simulation World News Engine
 * Procedurally generates living financial market catalysts across:
 * 1. Macroeconomic Policy & Central Bank Decisions
 * 2. Sector-Wide Waves & Inter-Stock Industry Contagion
 * 3. Corporate Earnings Reports (EPS Beats & Misses)
 * 4. High-Stakes Corporate Catalysts (Patents, Fabs, Contracts)
 * 5. Speculative Rumors & Activist Campaigns
 */
export class SimulationWorldNewsEngine extends EventEmitter {
  constructor(marketManager = null) {
    super();
    this.marketManager = marketManager;

    // Stateful Macroeconomic Simulation World State
    this.worldState = {
      interestRate: 5.25, // %
      cpiInflation: 3.1,  // %
      gdpGrowth: 2.3,     // %
      marketRegime: 'EXPANSION', // 'EXPANSION' | 'CONTRACTION' | 'INFLATION_SURGE' | 'TECH_RALLY'
      quarter: 1,
      year: 2026,
      sectorSentiment: {
        'Auto · EV': 0.05,
        'Solar · Clean Energy': 0.10,
        'Cloud · AI Systems': 0.20,
        'Banking · Treasury': 0.00,
        'Biotech · Pharma': 0.05,
        'Aerospace · Defense': 0.10,
        'Semiconductors · Hardware': 0.18,
        'Retail · E-Commerce': -0.02,
        'Cybersecurity · GovTech': 0.12,
        'Digital Media · Streaming': -0.04
      }
    };

    this.eventHistory = [];
    this.maxHistory = 50;
  }

  getWorldState() {
    return {
      ...this.worldState,
      sectorSentiment: { ...this.worldState.sectorSentiment }
    };
  }

  /**
   * Generates a procedurally generated, contextual world news event
   * @param {string} [forceCategory] 'MACRO' | 'SECTOR' | 'EARNINGS' | 'CORPORATE' | 'RUMOR'
   * @returns {Object} Structured news event compatible with MarketManager.triggerNewsEvent
   */
  generateWorldEvent(forceCategory = null) {
    const categories = ['MACRO', 'SECTOR', 'EARNINGS', 'CORPORATE', 'RUMOR'];
    const weights = [0.20, 0.25, 0.25, 0.20, 0.10];

    let category = forceCategory;
    if (!category) {
      const rand = Math.random();
      let cum = 0;
      for (let i = 0; i < categories.length; i++) {
        cum += weights[i];
        if (rand <= cum) {
          category = categories[i];
          break;
        }
      }
    }
    if (!category) category = 'CORPORATE';

    let event;
    switch (category) {
      case 'MACRO':
        event = this._generateMacroEvent();
        break;
      case 'SECTOR':
        event = this._generateSectorEvent();
        break;
      case 'EARNINGS':
        event = this._generateEarningsEvent();
        break;
      case 'CORPORATE':
        event = this._generateCorporateEvent();
        break;
      case 'RUMOR':
        event = this._generateRumorEvent();
        break;
      default:
        event = this._generateCorporateEvent();
    }

    event.category = category;
    event.timestamp = Date.now();
    event.id = `news_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    this.eventHistory.unshift(event);
    if (this.eventHistory.length > this.maxHistory) {
      this.eventHistory.pop();
    }

    this.emit('worldNewsGenerated', event);
    return event;
  }

  _generateMacroEvent() {
    const templates = [
      {
        headline: 'Central Bank raises policy rate +25bps to curb persistent services inflation',
        symbols: ['NBNK', 'BYTE', 'SEMI', 'RETL'],
        impact: { NBNK: 0.05, BYTE: -0.05, SEMI: -0.04, RETL: -0.03 },
        sentiment: 'MIXED',
        mutate: () => {
          this.worldState.interestRate += 0.25;
          this.worldState.sectorSentiment['Banking · Treasury'] += 0.05;
          this.worldState.sectorSentiment['Cloud · AI Systems'] -= 0.05;
        }
      },
      {
        headline: 'Central Bank cuts benchmark rate by 50bps citing disinflation; liquidity injected',
        symbols: ['BYTE', 'SEMI', 'AUTO', 'SOLR', 'NBNK'],
        impact: { BYTE: 0.08, SEMI: 0.09, AUTO: 0.06, SOLR: 0.07, NBNK: -0.04 },
        sentiment: 'BULLISH',
        mutate: () => {
          this.worldState.interestRate = Math.max(1.0, this.worldState.interestRate - 0.50);
          this.worldState.sectorSentiment['Cloud · AI Systems'] += 0.08;
          this.worldState.sectorSentiment['Semiconductors · Hardware'] += 0.08;
        }
      },
      {
        headline: 'Government passes bipartisan $880B National Defense Authorization Act',
        symbols: ['AERO', 'CYBR'],
        impact: { AERO: 0.11, CYBR: 0.09 },
        sentiment: 'BULLISH',
        mutate: () => {
          this.worldState.sectorSentiment['Aerospace · Defense'] += 0.10;
          this.worldState.sectorSentiment['Cybersecurity · GovTech'] += 0.08;
        }
      },
      {
        headline: 'Monthly CPI inflation print cools to 2.4% annualized, fueling broad market optimism',
        symbols: ['RETL', 'STRM', 'AUTO', 'SOLR'],
        impact: { RETL: 0.07, STRM: 0.06, AUTO: 0.05, SOLR: 0.05 },
        sentiment: 'BULLISH',
        mutate: () => {
          this.worldState.cpiInflation = 2.4;
          this.worldState.sectorSentiment['Retail · E-Commerce'] += 0.06;
        }
      }
    ];

    const pick = templates[Math.floor(Math.random() * templates.length)];
    if (pick.mutate) pick.mutate();
    return {
      headline: pick.headline,
      symbols: pick.symbols,
      impact: pick.impact,
      sentiment: pick.sentiment,
      isRumor: false
    };
  }

  _generateSectorEvent() {
    const templates = [
      {
        headline: 'Federal Clean Energy Grid modernizing act expands tax credits for solar & battery storage',
        symbols: ['SOLR', 'AUTO'],
        impact: { SOLR: 0.10, AUTO: 0.06 },
        sentiment: 'BULLISH'
      },
      {
        headline: 'Global semiconductor foundry equipment export controls tighten across overseas markets',
        symbols: ['SEMI', 'BYTE'],
        impact: { SEMI: -0.08, BYTE: -0.04 },
        sentiment: 'BEARISH'
      },
      {
        headline: 'Critical Infrastructure Cybersecurity Directive mandates zero-trust across federal agencies',
        symbols: ['CYBR', 'NBNK'],
        impact: { CYBR: 0.12, NBNK: 0.02 },
        sentiment: 'BULLISH'
      },
      {
        headline: 'Global freight and port logistics bottleneck disrupts consumer retail fulfillment',
        symbols: ['RETL', 'AUTO'],
        impact: { RETL: -0.06, AUTO: -0.04 },
        sentiment: 'BEARISH'
      },
      {
        headline: 'Digital streaming ad revenues climb +24% as consumer engagement hits record seasonal peak',
        symbols: ['STRM'],
        impact: { STRM: 0.08 },
        sentiment: 'BULLISH'
      }
    ];

    const pick = templates[Math.floor(Math.random() * templates.length)];
    return {
      headline: pick.headline,
      symbols: pick.symbols,
      impact: pick.impact,
      sentiment: pick.sentiment,
      isRumor: false
    };
  }

  _generateEarningsEvent() {
    const companies = [
      { sym: 'BYTE', name: 'ByteWorks', beat: 'Cloud AI recurring revenue surges +44% YoY, beats consensus EPS by 28¢', miss: 'Enterprise AI infrastructure sales decelerate, margins narrow on GPU lease costs' },
      { sym: 'SEMI', name: 'NovaSilicon', beat: 'Q2 2nm extreme-UV wafer yields hit 92%, backlog reaches $14.2B', miss: 'Consumer fab chip utilization softens, cuts forward quarterly guidance by 8%' },
      { sym: 'AERO', name: 'AeroDynamics', beat: 'Secures $4.8B hypersonic reconnaissance order, operating margin expands to 14.5%', miss: 'Commercial avionics division records $620M one-time charge on supply delays' },
      { sym: 'AUTO', name: 'AutoCorp', beat: 'Solid-state EV battery deliveries scale 3x ahead of scheduled rollout', miss: 'Warranty provisions rise 18%, European market EV market share slips 2.1%' },
      { sym: 'NBNK', name: 'National Bank', beat: 'Net interest income expands +16% as treasury trading desks deliver record quarter', miss: 'Commercial real estate loan-loss provisions raised +45M, fee income misses' },
      { sym: 'MEDL', name: 'MedLife', beat: 'Blockbuster immunology franchise sales jump +32%, raises full-year profit outlook', miss: 'Early-stage pipeline trial requires dose re-optimization, delaying Phase 2 data' },
      { sym: 'RETL', name: 'OmniRetail', beat: 'Direct-to-consumer automated fulfillment cuts delivery costs by 22%, beats sales expectations', miss: 'Discretionary apparel inventory write-downs drag operating income down 11%' },
      { sym: 'CYBR', name: 'CipherShield', beat: 'Annual recurring revenue (ARR) tops $500M with 132% net revenue retention', miss: 'Longer enterprise sales procurement cycles delay landmark multi-year renewals' },
      { sym: 'SOLR', name: 'SolarGen', beat: 'Utility-scale solar farm deployments generate record 4.2 GW capacity in Q2', miss: 'Interconnection grid approval delays push two primary project completions to next year' },
      { sym: 'STRM', name: 'StreamPulse', beat: 'Global paid subscriber base expands by 7.4M net adds, ad-tier monetization doubles', miss: 'Content amortization costs peak while average revenue per user (ARPU) flatlines' }
    ];

    const c = companies[Math.floor(Math.random() * companies.length)];
    const isBeat = Math.random() > 0.45; // 55% chance of beat
    const impactVal = isBeat ? +(Math.random() * 0.05 + 0.05).toFixed(2) : -(+(Math.random() * 0.04 + 0.04).toFixed(2));
    const headline = isBeat
      ? `EARNINGS: ${c.name} (${c.sym}) reports blowout quarter — ${c.beat}`
      : `EARNINGS: ${c.name} (${c.sym}) misses quarterly expectations — ${c.miss}`;

    return {
      headline,
      symbols: [c.sym],
      impact: { [c.sym]: impactVal },
      sentiment: isBeat ? 'BULLISH' : 'BEARISH',
      isRumor: false
    };
  }

  _generateCorporateEvent() {
    const templates = [
      {
        headline: 'ByteWorks announces multi-billion strategic enterprise partnership for autonomous LLM agents',
        symbols: ['BYTE', 'SEMI'],
        impact: { BYTE: 0.09, SEMI: 0.06 },
        sentiment: 'BULLISH'
      },
      {
        headline: 'AeroDynamics awarded $3.2B orbital satellite defense contract from space defense command',
        symbols: ['AERO'],
        impact: { AERO: 0.08 },
        sentiment: 'BULLISH'
      },
      {
        headline: 'MedLife receives breakthrough therapy designation from regulatory agency for rare oncology trial',
        symbols: ['MEDL'],
        impact: { MEDL: 0.12 },
        sentiment: 'BULLISH'
      },
      {
        headline: 'NovaSilicon announces breakthrough 1.4nm manufacturing node architecture with 35% power efficiency gain',
        symbols: ['SEMI'],
        impact: { SEMI: 0.10 },
        sentiment: 'BULLISH'
      },
      {
        headline: 'CipherShield awarded top cybersecurity vendor award following successful defense against state-sponsored intrusion',
        symbols: ['CYBR'],
        impact: { CYBR: 0.07 },
        sentiment: 'BULLISH'
      }
    ];

    const pick = templates[Math.floor(Math.random() * templates.length)];
    return {
      headline: pick.headline,
      symbols: pick.symbols,
      impact: pick.impact,
      sentiment: pick.sentiment,
      isRumor: false
    };
  }

  _generateRumorEvent() {
    const templates = [
      {
        headline: 'RUMOR: Prominent activist hedge fund acquires 8.2% stake in OmniRetail demanding strategic sale',
        symbols: ['RETL'],
        impact: { RETL: 0.08 },
        sentiment: 'BULLISH',
        isRumor: true
      },
      {
        headline: 'RUMOR: Global tech conglomerate preparing unsolicited 30% premium takeover bid for StreamPulse',
        symbols: ['STRM'],
        impact: { STRM: 0.11 },
        sentiment: 'BULLISH',
        isRumor: true
      },
      {
        headline: 'RUMOR: Anonymous short-seller report questions revenue recognition in CipherShield overseas gov contracts',
        symbols: ['CYBR'],
        impact: { CYBR: -0.07 },
        sentiment: 'BEARISH',
        isRumor: true
      },
      {
        headline: 'RUMOR: AutoCorp in advanced merger talks with European autonomous trucking consortium',
        symbols: ['AUTO'],
        impact: { AUTO: 0.07 },
        sentiment: 'BULLISH',
        isRumor: true
      },
      {
        headline: 'RUMOR: National Bank negotiating distressed asset acquisition at steep 40% discount',
        symbols: ['NBNK'],
        impact: { NBNK: 0.05 },
        sentiment: 'BULLISH',
        isRumor: true
      }
    ];

    const pick = templates[Math.floor(Math.random() * templates.length)];
    return {
      headline: pick.headline,
      symbols: pick.symbols,
      impact: pick.impact,
      sentiment: pick.sentiment,
      isRumor: true
    };
  }
}
