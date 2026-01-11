import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import OpenAI from 'openai';

// =====================================================
// TYPES
// =====================================================
export type EntityType = 'product' | 'business' | 'category';

export interface EmbeddingResult {
  entityType: EntityType;
  entityId: string;
  embedding: number[];
  embeddedText: string;
}

export interface SimilarityResult {
  entityType: EntityType;
  entityId: string;
  similarity: number;
}

// =====================================================
// EMBEDDING SERVICE
// =====================================================
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly openai: OpenAI;
  private readonly model = 'text-embedding-ada-002';
  private readonly dimensions = 1536;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get('OPENAI_API_KEY'),
    });
  }

  // =====================================================
  // GENERATE EMBEDDING
  // =====================================================
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: this.preprocessText(text),
      });

      return response.data[0].embedding;
    } catch (error: any) {
      this.logger.error(`Failed to generate embedding: ${error.message}`);
      throw error;
    }
  }

  // =====================================================
  // GENERATE BATCH EMBEDDINGS
  // =====================================================
  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const processedTexts = texts.map((t) => this.preprocessText(t));
      
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: processedTexts,
      });

      return response.data.map((d) => d.embedding);
    } catch (error: any) {
      this.logger.error(`Failed to generate batch embeddings: ${error.message}`);
      throw error;
    }
  }

  // =====================================================
  // EMBED PRODUCT
  // =====================================================
  async embedProduct(productId: string): Promise<EmbeddingResult> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        category: true,
        business: { select: { businessName: true, city: true } },
      },
    });

    if (!product) {
      throw new Error(`Product not found: ${productId}`);
    }

    // Build rich text representation
    const textParts = [
      product.name,
      product.description || '',
      product.shortDescription || '',
      product.category?.name || '',
      product.business?.businessName || '',
      product.business?.city || '',
      ...(product.tags || []),
      // Include attributes as text
      ...Object.entries(product.attributes || {}).map(
        ([k, v]) => `${k}: ${v}`,
      ),
    ];

    const embeddedText = textParts.filter(Boolean).join(' ');
    const embedding = await this.generateEmbedding(embeddedText);

    // Store in database
    await this.upsertEmbedding('product', productId, embedding, embeddedText);

    return {
      entityType: 'product',
      entityId: productId,
      embedding,
      embeddedText,
    };
  }

  // =====================================================
  // EMBED BUSINESS
  // =====================================================
  async embedBusiness(businessId: string): Promise<EmbeddingResult> {
    const business = await this.prisma.businessProfile.findUnique({
      where: { id: businessId },
      include: {
        category: true,
        products: { select: { name: true }, take: 10 },
      },
    });

    if (!business) {
      throw new Error(`Business not found: ${businessId}`);
    }

    // Build rich text representation
    const textParts = [
      business.businessName,
      business.description || '',
      business.tagline || '',
      business.category?.name || '',
      business.city || '',
      business.county || '',
      business.businessType,
      ...(business.specializations || []),
      // Include top product names
      ...business.products.map((p) => p.name),
    ];

    const embeddedText = textParts.filter(Boolean).join(' ');
    const embedding = await this.generateEmbedding(embeddedText);

    // Store in database
    await this.upsertEmbedding('business', businessId, embedding, embeddedText);

    return {
      entityType: 'business',
      entityId: businessId,
      embedding,
      embeddedText,
    };
  }

  // =====================================================
  // EMBED CATEGORY
  // =====================================================
  async embedCategory(categoryId: string): Promise<EmbeddingResult> {
    const category = await this.prisma.businessCategory.findUnique({
      where: { id: categoryId },
      include: { parent: true },
    });

    if (!category) {
      throw new Error(`Category not found: ${categoryId}`);
    }

    const textParts = [
      category.name,
      category.description || '',
      category.parent?.name || '',
    ];

    const embeddedText = textParts.filter(Boolean).join(' ');
    const embedding = await this.generateEmbedding(embeddedText);

    await this.upsertEmbedding('category', categoryId, embedding, embeddedText);

    return {
      entityType: 'category',
      entityId: categoryId,
      embedding,
      embeddedText,
    };
  }

  // =====================================================
  // BATCH EMBED ALL PRODUCTS
  // =====================================================
  async embedAllProducts(batchSize = 100): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;
    let skip = 0;

    while (true) {
      const products = await this.prisma.product.findMany({
        where: { status: 'active' },
        select: { id: true },
        skip,
        take: batchSize,
      });

      if (products.length === 0) break;

      for (const product of products) {
        try {
          await this.embedProduct(product.id);
          processed++;
        } catch (error) {
          this.logger.error(`Failed to embed product ${product.id}`);
          failed++;
        }
      }

      skip += batchSize;
      this.logger.log(`Embedded ${processed} products, ${failed} failed`);
    }

    return { processed, failed };
  }

  // =====================================================
  // BATCH EMBED ALL BUSINESSES
  // =====================================================
  async embedAllBusinesses(batchSize = 50): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;
    let skip = 0;

    while (true) {
      const businesses = await this.prisma.businessProfile.findMany({
        where: { status: 'approved' },
        select: { id: true },
        skip,
        take: batchSize,
      });

      if (businesses.length === 0) break;

      for (const business of businesses) {
        try {
          await this.embedBusiness(business.id);
          processed++;
        } catch (error) {
          this.logger.error(`Failed to embed business ${business.id}`);
          failed++;
        }
      }

      skip += batchSize;
      this.logger.log(`Embedded ${processed} businesses, ${failed} failed`);
    }

    return { processed, failed };
  }

  // =====================================================
  // SEARCH BY VECTOR SIMILARITY
  // =====================================================
  async searchByVector(
    queryEmbedding: number[],
    entityTypes: EntityType[],
    limit = 20,
    threshold = 0.7,
  ): Promise<SimilarityResult[]> {
    // Use raw query for vector similarity search
    const results = await this.prisma.$queryRaw<SimilarityResult[]>`
      SELECT 
        entity_type as "entityType",
        entity_id as "entityId",
        1 - (embedding <=> ${queryEmbedding}::vector) as similarity
      FROM embeddings
      WHERE entity_type = ANY(${entityTypes})
      AND 1 - (embedding <=> ${queryEmbedding}::vector) >= ${threshold}
      ORDER BY embedding <=> ${queryEmbedding}::vector
      LIMIT ${limit}
    `;

    return results;
  }

  // =====================================================
  // FIND SIMILAR ENTITIES
  // =====================================================
  async findSimilar(
    entityType: EntityType,
    entityId: string,
    limit = 10,
  ): Promise<SimilarityResult[]> {
    const results = await this.prisma.$queryRaw<SimilarityResult[]>`
      SELECT 
        e2.entity_type as "entityType",
        e2.entity_id as "entityId",
        1 - (e2.embedding <=> e1.embedding) as similarity
      FROM embeddings e1, embeddings e2
      WHERE e1.entity_type = ${entityType}
      AND e1.entity_id = ${entityId}::uuid
      AND e2.entity_type = ${entityType}
      AND e2.entity_id != ${entityId}::uuid
      ORDER BY e2.embedding <=> e1.embedding
      LIMIT ${limit}
    `;

    return results;
  }

  // =====================================================
  // DELETE EMBEDDING
  // =====================================================
  async deleteEmbedding(entityType: EntityType, entityId: string): Promise<void> {
    await this.prisma.$executeRaw`
      DELETE FROM embeddings 
      WHERE entity_type = ${entityType} AND entity_id = ${entityId}::uuid
    `;
  }

  // =====================================================
  // PRIVATE HELPERS
  // =====================================================
  private preprocessText(text: string): string {
    return text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000); // OpenAI limit
  }

  private async upsertEmbedding(
    entityType: EntityType,
    entityId: string,
    embedding: number[],
    embeddedText: string,
  ): Promise<void> {
    // Use raw query for pgvector
    await this.prisma.$executeRaw`
      INSERT INTO embeddings (entity_type, entity_id, embedding, embedded_text, model)
      VALUES (${entityType}, ${entityId}::uuid, ${embedding}::vector, ${embeddedText}, ${this.model})
      ON CONFLICT (entity_type, entity_id) 
      DO UPDATE SET 
        embedding = ${embedding}::vector,
        embedded_text = ${embeddedText},
        updated_at = NOW()
    `;
  }
}
