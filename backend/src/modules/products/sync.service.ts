import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncPushDto, SyncPullDto } from './dto/product.dto';

interface SyncChange {
  entityType: string;
  entityId: string;
  syncId: string;
  operation: 'create' | 'update' | 'delete';
  payload: any;
  clientTimestamp: Date;
}

interface SyncResult {
  success: boolean;
  entityId: string;
  syncId: string;
  serverTimestamp: Date;
  error?: string;
  conflictData?: any;
}

@Injectable()
export class SyncService {
  constructor(private prisma: PrismaService) {}

  // =====================================================
  // PUSH - Client sends changes to server
  // =====================================================
  async pushChanges(
    userId: string,
    businessId: string,
    dto: SyncPushDto,
  ): Promise<{ results: SyncResult[]; serverTimestamp: Date }> {
    const results: SyncResult[] = [];
    const serverTimestamp = new Date();

    for (const change of dto.changes) {
      try {
        const result = await this.processChange(
          userId,
          businessId,
          dto.deviceId,
          change,
        );
        results.push(result);
      } catch (error: any) {
        results.push({
          success: false,
          entityId: change.entityId,
          syncId: change.syncId,
          serverTimestamp,
          error: error.message,
        });
      }
    }

    // Update checkpoint
    await this.updateCheckpoint(userId, businessId, dto.deviceId, serverTimestamp);

    return { results, serverTimestamp };
  }

  private async processChange(
    userId: string,
    businessId: string,
    deviceId: string,
    change: SyncChange,
  ): Promise<SyncResult> {
    const serverTimestamp = new Date();

    // Check for conflicts (server has newer data)
    const conflict = await this.checkConflict(
      change.entityType,
      change.entityId,
      change.clientTimestamp,
    );

    if (conflict) {
      // Store in queue for manual resolution
      await this.prisma.syncQueue.create({
        data: {
          userId,
          businessId,
          deviceId,
          entityType: change.entityType,
          entityId: change.entityId,
          syncId: change.syncId,
          operation: change.operation,
          payload: change.payload,
          clientTimestamp: new Date(change.clientTimestamp),
          status: 'conflict',
        },
      });

      return {
        success: false,
        entityId: change.entityId,
        syncId: change.syncId,
        serverTimestamp,
        error: 'Conflict detected',
        conflictData: conflict,
      };
    }

    // Process the change
    switch (change.entityType) {
      case 'product':
        await this.syncProduct(businessId, change);
        break;
      case 'product_category':
        await this.syncProductCategory(businessId, change);
        break;
      case 'product_image':
        await this.syncProductImage(change);
        break;
      default:
        throw new BadRequestException(`Unknown entity type: ${change.entityType}`);
    }

    // Mark as completed
    await this.prisma.syncQueue.create({
      data: {
        userId,
        businessId,
        deviceId,
        entityType: change.entityType,
        entityId: change.entityId,
        syncId: change.syncId,
        operation: change.operation,
        payload: change.payload,
        clientTimestamp: new Date(change.clientTimestamp),
        status: 'completed',
        processedAt: serverTimestamp,
      },
    });

    return {
      success: true,
      entityId: change.entityId,
      syncId: change.syncId,
      serverTimestamp,
    };
  }

  private async syncProduct(businessId: string, change: SyncChange) {
    const { operation, entityId, payload, syncId } = change;

    switch (operation) {
      case 'create':
        await this.prisma.product.create({
          data: {
            ...payload,
            id: entityId,
            businessId,
            syncId,
            lastSyncedAt: new Date(),
          },
        });
        break;

      case 'update':
        await this.prisma.product.update({
          where: { id: entityId },
          data: {
            ...payload,
            lastSyncedAt: new Date(),
          },
        });
        break;

      case 'delete':
        await this.prisma.product.delete({
          where: { id: entityId },
        });
        break;
    }
  }

  private async syncProductCategory(businessId: string, change: SyncChange) {
    const { operation, entityId, payload } = change;

    switch (operation) {
      case 'create':
        await this.prisma.productCategory.create({
          data: {
            ...payload,
            id: entityId,
            businessId,
          },
        });
        break;

      case 'update':
        await this.prisma.productCategory.update({
          where: { id: entityId },
          data: payload,
        });
        break;

      case 'delete':
        await this.prisma.productCategory.update({
          where: { id: entityId },
          data: { isActive: false },
        });
        break;
    }
  }

  private async syncProductImage(change: SyncChange) {
    const { operation, entityId, payload } = change;

    switch (operation) {
      case 'create':
        await this.prisma.productImage.create({
          data: {
            ...payload,
            id: entityId,
            uploadStatus: 'pending', // Will be completed after actual upload
          },
        });
        break;

      case 'update':
        await this.prisma.productImage.update({
          where: { id: entityId },
          data: payload,
        });
        break;

      case 'delete':
        await this.prisma.productImage.delete({
          where: { id: entityId },
        });
        break;
    }
  }

  private async checkConflict(
    entityType: string,
    entityId: string,
    clientTimestamp: Date,
  ): Promise<any | null> {
    let serverEntity: any = null;

    switch (entityType) {
      case 'product':
        serverEntity = await this.prisma.product.findUnique({
          where: { id: entityId },
          select: { updatedAt: true, name: true, price: true, quantity: true },
        });
        break;
      case 'product_category':
        serverEntity = await this.prisma.productCategory.findUnique({
          where: { id: entityId },
          select: { updatedAt: true, name: true },
        });
        break;
    }

    if (!serverEntity) return null;

    // Conflict if server was updated after client change
    if (serverEntity.updatedAt > new Date(clientTimestamp)) {
      return serverEntity;
    }

    return null;
  }

  // =====================================================
  // PULL - Client fetches changes from server
  // =====================================================
  async pullChanges(
    userId: string,
    businessId: string,
    dto: SyncPullDto,
  ): Promise<{
    changes: any[];
    serverTimestamp: Date;
    hasMore: boolean;
  }> {
    const { deviceId, lastSyncAt, entityTypes } = dto;
    const serverTimestamp = new Date();
    const limit = 100; // Batch size

    const changes: any[] = [];

    // Get products changed since last sync
    if (!entityTypes || entityTypes.includes('product')) {
      const products = await this.prisma.product.findMany({
        where: {
          businessId,
          updatedAt: { gt: new Date(lastSyncAt) },
        },
        include: {
          images: true,
          variants: true,
          category: { select: { id: true, name: true } },
        },
        take: limit,
        orderBy: { updatedAt: 'asc' },
      });

      products.forEach((p) => {
        changes.push({
          entityType: 'product',
          entityId: p.id,
          syncId: p.syncId,
          operation: 'update', // Could be create, but client handles upsert
          data: p,
          serverTimestamp: p.updatedAt,
        });
      });
    }

    // Get categories changed since last sync
    if (!entityTypes || entityTypes.includes('product_category')) {
      const categories = await this.prisma.productCategory.findMany({
        where: {
          businessId,
          updatedAt: { gt: new Date(lastSyncAt) },
        },
        take: limit,
        orderBy: { updatedAt: 'asc' },
      });

      categories.forEach((c) => {
        changes.push({
          entityType: 'product_category',
          entityId: c.id,
          operation: c.isActive ? 'update' : 'delete',
          data: c,
          serverTimestamp: c.updatedAt,
        });
      });
    }

    // Check for deleted items (via sync queue)
    const deletions = await this.prisma.syncQueue.findMany({
      where: {
        businessId,
        operation: 'delete',
        processedAt: { gt: new Date(lastSyncAt) },
        status: 'completed',
      },
      take: limit,
    });

    deletions.forEach((d) => {
      changes.push({
        entityType: d.entityType,
        entityId: d.entityId,
        operation: 'delete',
        data: null,
        serverTimestamp: d.processedAt,
      });
    });

    // Update checkpoint
    await this.updateCheckpoint(userId, businessId, deviceId, serverTimestamp);

    return {
      changes: changes.slice(0, limit),
      serverTimestamp,
      hasMore: changes.length > limit,
    };
  }

  // =====================================================
  // CONFLICT RESOLUTION
  // =====================================================
  async getConflicts(userId: string, businessId: string) {
    return this.prisma.syncQueue.findMany({
      where: {
        userId,
        businessId,
        status: 'conflict',
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async resolveConflict(
    conflictId: string,
    resolution: 'keep_server' | 'keep_client' | 'merge',
    mergedData?: any,
  ) {
    const conflict = await this.prisma.syncQueue.findUnique({
      where: { id: conflictId },
    });

    if (!conflict) throw new NotFoundException('Conflict not found');

    if (resolution === 'keep_client' || resolution === 'merge') {
      const dataToApply = resolution === 'merge' ? mergedData : conflict.payload;

      // Apply the change
      await this.processChange(
        conflict.userId,
        conflict.businessId!,
        conflict.deviceId,
        {
          entityType: conflict.entityType,
          entityId: conflict.entityId,
          syncId: conflict.syncId,
          operation: conflict.operation,
          payload: dataToApply,
          clientTimestamp: conflict.clientTimestamp,
        },
      );
    }

    // Mark conflict as resolved
    await this.prisma.syncQueue.update({
      where: { id: conflictId },
      data: {
        status: 'completed',
        processedAt: new Date(),
      },
    });

    return { message: 'Conflict resolved' };
  }

  // =====================================================
  // CHECKPOINT MANAGEMENT
  // =====================================================
  private async updateCheckpoint(
    userId: string,
    businessId: string,
    deviceId: string,
    timestamp: Date,
  ) {
    await this.prisma.syncCheckpoint.upsert({
      where: {
        userId_businessId_deviceId_entityType: {
          userId,
          businessId,
          deviceId,
          entityType: 'all',
        },
      },
      create: {
        userId,
        businessId,
        deviceId,
        entityType: 'all',
        lastSyncAt: timestamp,
      },
      update: {
        lastSyncAt: timestamp,
      },
    });
  }

  async getCheckpoint(userId: string, businessId: string, deviceId: string) {
    const checkpoint = await this.prisma.syncCheckpoint.findFirst({
      where: {
        userId,
        businessId,
        deviceId,
      },
      orderBy: { lastSyncAt: 'desc' },
    });

    return {
      lastSyncAt: checkpoint?.lastSyncAt || new Date(0),
      deviceId,
    };
  }

  // =====================================================
  // FULL SYNC (Initial sync for new device)
  // =====================================================
  async fullSync(userId: string, businessId: string, deviceId: string) {
    const [products, categories] = await Promise.all([
      this.prisma.product.findMany({
        where: { businessId },
        include: {
          images: true,
          variants: true,
          category: { select: { id: true, name: true, slug: true } },
        },
      }),
      this.prisma.productCategory.findMany({
        where: { businessId, isActive: true },
      }),
    ]);

    const serverTimestamp = new Date();

    // Create checkpoint
    await this.updateCheckpoint(userId, businessId, deviceId, serverTimestamp);

    return {
      products,
      categories,
      serverTimestamp,
    };
  }
}
