import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * ContentDetectionService handles AI-powered content analysis
 * 
 * Uses:
 * - Google Cloud Vision for image analysis
 * - Custom alcohol/tobacco detection model
 * - Text moderation via perspective API or custom
 */

// =====================================================
// TYPES
// =====================================================
export interface DetectionResult {
  isAllowed: boolean;
  requiresReview: boolean;
  labels: string[];
  scores: Record<string, number>;
  confidence: number;
  details?: string;
}

export interface ImageAnalysisResult extends DetectionResult {
  safeSearch: {
    adult: string;
    violence: string;
    racy: string;
  };
  objects: string[];
  text?: string;
}

export interface TextAnalysisResult extends DetectionResult {
  toxicity: number;
  profanity: boolean;
  spam: boolean;
  bannedWords: string[];
}

// =====================================================
// DETECTION SERVICE
// =====================================================
@Injectable()
export class ContentDetectionService {
  private readonly logger = new Logger(ContentDetectionService.name);
  
  // Detection thresholds
  private readonly thresholds = {
    alcohol: 0.7,
    tobacco: 0.7,
    nsfw: 0.8,
    violence: 0.8,
    toxicity: 0.7,
  };

  // Banned keywords (load from DB in production)
  private bannedKeywords = [
    // Add actual banned terms in production
    'scam', 'fake', 'counterfeit', 'illegal',
  ];

  // Alcohol-related terms (for text detection)
  private alcoholTerms = [
    'beer', 'wine', 'whiskey', 'vodka', 'gin', 'rum', 'tequila',
    'champagne', 'cognac', 'brandy', 'liquor', 'alcohol', 'spirits',
    'cocktail', 'lager', 'ale', 'stout', 'cider', 'sake', 'soju',
    'tusker', 'pilsner', 'guinness', 'baileys', 'hennessy', 'johnnie walker',
  ];

  // Tobacco-related terms
  private tobaccoTerms = [
    'cigarette', 'tobacco', 'cigar', 'vape', 'e-cigarette', 'nicotine',
    'smoking', 'shisha', 'hookah', 'marlboro', 'dunhill', 'sportsman',
  ];

  constructor(private configService: ConfigService) {}

  // =====================================================
  // IMAGE ANALYSIS
  // =====================================================
  async analyzeImage(imageUrl: string): Promise<ImageAnalysisResult> {
    try {
      // In production, use Google Cloud Vision API
      // For now, use mock detection based on URL patterns
      
      const labels: string[] = [];
      const scores: Record<string, number> = {};
      
      // Mock detection (replace with actual API call)
      const mockResult = await this.mockImageAnalysis(imageUrl);
      
      // Check for restricted content
      let isAllowed = true;
      let requiresReview = false;

      // Alcohol detection
      if (mockResult.alcoholScore > this.thresholds.alcohol) {
        labels.push('alcohol');
        scores['alcohol'] = mockResult.alcoholScore;
        requiresReview = true;
      }

      // Tobacco detection
      if (mockResult.tobaccoScore > this.thresholds.tobacco) {
        labels.push('tobacco');
        scores['tobacco'] = mockResult.tobaccoScore;
        requiresReview = true;
      }

      // NSFW detection
      if (mockResult.nsfwScore > this.thresholds.nsfw) {
        labels.push('nsfw');
        scores['nsfw'] = mockResult.nsfwScore;
        isAllowed = false;
      }

      // Violence detection
      if (mockResult.violenceScore > this.thresholds.violence) {
        labels.push('violence');
        scores['violence'] = mockResult.violenceScore;
        isAllowed = false;
      }

      const confidence = labels.length > 0 
        ? Math.max(...Object.values(scores)) 
        : 0;

      return {
        isAllowed,
        requiresReview,
        labels,
        scores,
        confidence,
        safeSearch: mockResult.safeSearch,
        objects: mockResult.objects,
        text: mockResult.detectedText,
      };
    } catch (error: any) {
      this.logger.error(`Image analysis failed: ${error.message}`);
      // On error, flag for manual review
      return {
        isAllowed: true,
        requiresReview: true,
        labels: ['analysis_error'],
        scores: {},
        confidence: 0,
        safeSearch: { adult: 'UNKNOWN', violence: 'UNKNOWN', racy: 'UNKNOWN' },
        objects: [],
        details: error.message,
      };
    }
  }

  // =====================================================
  // TEXT ANALYSIS
  // =====================================================
  async analyzeText(text: string): Promise<TextAnalysisResult> {
    if (!text?.trim()) {
      return {
        isAllowed: true,
        requiresReview: false,
        labels: [],
        scores: {},
        confidence: 0,
        toxicity: 0,
        profanity: false,
        spam: false,
        bannedWords: [],
      };
    }

    const normalizedText = text.toLowerCase();
    const labels: string[] = [];
    const scores: Record<string, number> = {};
    const foundBannedWords: string[] = [];

    // Check for banned keywords
    for (const keyword of this.bannedKeywords) {
      if (normalizedText.includes(keyword.toLowerCase())) {
        foundBannedWords.push(keyword);
      }
    }

    if (foundBannedWords.length > 0) {
      labels.push('banned_keywords');
      scores['banned'] = 1.0;
    }

    // Check for alcohol terms
    const alcoholMatches = this.alcoholTerms.filter(term => 
      normalizedText.includes(term.toLowerCase())
    );
    if (alcoholMatches.length > 0) {
      labels.push('alcohol_mention');
      scores['alcohol'] = Math.min(1, alcoholMatches.length * 0.3);
    }

    // Check for tobacco terms
    const tobaccoMatches = this.tobaccoTerms.filter(term =>
      normalizedText.includes(term.toLowerCase())
    );
    if (tobaccoMatches.length > 0) {
      labels.push('tobacco_mention');
      scores['tobacco'] = Math.min(1, tobaccoMatches.length * 0.3);
    }

    // Check for spam patterns
    const spamScore = this.calculateSpamScore(text);
    if (spamScore > 0.7) {
      labels.push('spam');
      scores['spam'] = spamScore;
    }

    // Mock toxicity (use Perspective API in production)
    const toxicity = this.mockToxicityAnalysis(text);
    if (toxicity > this.thresholds.toxicity) {
      labels.push('toxic');
      scores['toxicity'] = toxicity;
    }

    // Profanity check
    const hasProfanity = this.checkProfanity(text);
    if (hasProfanity) {
      labels.push('profanity');
      scores['profanity'] = 1.0;
    }

    const isAllowed = !foundBannedWords.length && toxicity < 0.9 && !hasProfanity;
    const requiresReview = labels.length > 0;

    return {
      isAllowed,
      requiresReview,
      labels,
      scores,
      confidence: labels.length > 0 ? Math.max(...Object.values(scores)) : 0,
      toxicity,
      profanity: hasProfanity,
      spam: spamScore > 0.7,
      bannedWords: foundBannedWords,
    };
  }

  // =====================================================
  // PRODUCT ANALYSIS
  // =====================================================
  async analyzeProduct(product: {
    name: string;
    description?: string;
    categoryId?: string;
    imageUrls?: string[];
  }): Promise<{
    isAllowed: boolean;
    requiresReview: boolean;
    requiresLicense: string | null;
    flags: string[];
    details: Record<string, any>;
  }> {
    const flags: string[] = [];
    const details: Record<string, any> = {};
    let requiresLicense: string | null = null;

    // Analyze text content
    const textContent = `${product.name} ${product.description || ''}`;
    const textResult = await this.analyzeText(textContent);
    
    if (textResult.labels.length > 0) {
      flags.push(...textResult.labels);
      details.textAnalysis = textResult;
    }

    // Check if product requires license
    if (textResult.labels.includes('alcohol_mention')) {
      requiresLicense = 'alcohol_retail';
      flags.push('requires_alcohol_license');
    }

    if (textResult.labels.includes('tobacco_mention')) {
      requiresLicense = 'tobacco';
      flags.push('requires_tobacco_license');
    }

    // Analyze images
    if (product.imageUrls?.length) {
      for (const imageUrl of product.imageUrls.slice(0, 5)) {
        const imageResult = await this.analyzeImage(imageUrl);
        if (imageResult.labels.length > 0) {
          flags.push(...imageResult.labels.map(l => `image_${l}`));
          details.imageAnalysis = details.imageAnalysis || [];
          details.imageAnalysis.push(imageResult);
        }

        if (imageResult.labels.includes('alcohol') && !requiresLicense) {
          requiresLicense = 'alcohol_retail';
        }
      }
    }

    // Determine final status
    const isAllowed = !flags.some(f => 
      f.includes('nsfw') || f.includes('violence') || f === 'banned_keywords'
    );
    
    const requiresReview = flags.length > 0 || requiresLicense !== null;

    return {
      isAllowed,
      requiresReview,
      requiresLicense,
      flags: [...new Set(flags)],
      details,
    };
  }

  // =====================================================
  // REEL/VIDEO ANALYSIS
  // =====================================================
  async analyzeReel(reel: {
    thumbnailUrl?: string;
    caption?: string;
    hashtags?: string[];
  }): Promise<DetectionResult> {
    const labels: string[] = [];
    const scores: Record<string, number> = {};

    // Analyze thumbnail
    if (reel.thumbnailUrl) {
      const imageResult = await this.analyzeImage(reel.thumbnailUrl);
      if (imageResult.labels.length > 0) {
        labels.push(...imageResult.labels);
        Object.assign(scores, imageResult.scores);
      }
    }

    // Analyze caption
    if (reel.caption) {
      const textResult = await this.analyzeText(reel.caption);
      if (textResult.labels.length > 0) {
        labels.push(...textResult.labels);
        Object.assign(scores, textResult.scores);
      }
    }

    // Check hashtags
    if (reel.hashtags?.length) {
      const hashtagText = reel.hashtags.join(' ');
      const hashtagResult = await this.analyzeText(hashtagText);
      if (hashtagResult.labels.length > 0) {
        labels.push(...hashtagResult.labels.map(l => `hashtag_${l}`));
      }
    }

    const uniqueLabels = [...new Set(labels)];
    const isAllowed = !uniqueLabels.some(l => 
      l.includes('nsfw') || l.includes('violence')
    );

    return {
      isAllowed,
      requiresReview: uniqueLabels.length > 0,
      labels: uniqueLabels,
      scores,
      confidence: Object.keys(scores).length > 0 
        ? Math.max(...Object.values(scores)) 
        : 0,
    };
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================
  private async mockImageAnalysis(imageUrl: string): Promise<{
    alcoholScore: number;
    tobaccoScore: number;
    nsfwScore: number;
    violenceScore: number;
    safeSearch: { adult: string; violence: string; racy: string };
    objects: string[];
    detectedText?: string;
  }> {
    // Mock implementation - replace with actual Cloud Vision API
    // In production: use Google Cloud Vision, AWS Rekognition, or custom model
    
    const urlLower = imageUrl.toLowerCase();
    
    return {
      alcoholScore: urlLower.includes('beer') || urlLower.includes('wine') ? 0.85 : 0.1,
      tobaccoScore: urlLower.includes('cigarette') ? 0.85 : 0.1,
      nsfwScore: 0.05,
      violenceScore: 0.05,
      safeSearch: {
        adult: 'VERY_UNLIKELY',
        violence: 'VERY_UNLIKELY',
        racy: 'UNLIKELY',
      },
      objects: ['product'],
    };
  }

  private mockToxicityAnalysis(text: string): number {
    // Mock implementation - use Perspective API in production
    const toxicPatterns = [
      /\b(hate|kill|die|stupid|idiot)\b/i,
    ];

    let score = 0;
    for (const pattern of toxicPatterns) {
      if (pattern.test(text)) {
        score += 0.3;
      }
    }

    return Math.min(1, score);
  }

  private checkProfanity(text: string): boolean {
    // Simple profanity check - use a proper library in production
    const profanityPatterns = [
      // Add actual patterns in production
      /\b(f[*u]ck|sh[*i]t)\b/i,
    ];

    return profanityPatterns.some(p => p.test(text));
  }

  private calculateSpamScore(text: string): number {
    let score = 0;

    // Check for excessive caps
    const capsRatio = (text.match(/[A-Z]/g) || []).length / text.length;
    if (capsRatio > 0.5) score += 0.3;

    // Check for excessive repetition
    if (/(.)\1{4,}/.test(text)) score += 0.3;

    // Check for too many exclamation marks
    const exclamationCount = (text.match(/!/g) || []).length;
    if (exclamationCount > 5) score += 0.2;

    // Check for suspicious phrases
    const spamPhrases = ['click here', 'buy now', 'limited time', 'act fast', 'free money'];
    for (const phrase of spamPhrases) {
      if (text.toLowerCase().includes(phrase)) score += 0.2;
    }

    return Math.min(1, score);
  }
}
