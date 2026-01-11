import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

// =====================================================
// TYPES
// =====================================================
export interface TrackEventDto {
  eventName: string;
  eventCategory?: string;
  userId?: string;
  anonymousId?: string;
  sessionId?: string;
  businessId?: string;
  productId?: string;
  orderId?: string;
  properties?: Record<string, any>;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrer?: string;
  deviceType?: string;
  platform?: string;
  appVersion?: string;
  country?: string;
  city?: string;
  clientTimestamp?: Date;
}

export interface PageViewDto {
  pagePath: string;
  pageTitle?: string;
  pageType?: string;
  userId?: string;
  anonymousId?: string;
  sessionId: string;
  productId?: string;
  businessId?: string;
  categoryId?: string;
  timeOnPage?: number;
  scrollDepth?: number;
  referrerPath?: string;
  referrerExternal?: string;
  deviceType?: string;
  platform?: string;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

// =====================================================
// ANALYTICS SERVICE
// =====================================================
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private prisma: PrismaService) {}

  // =====================================================
  // EVENT TRACKING
  // =====================================================

  /**
   * Track a generic event
   */
  async track(event: TrackEventDto): Promise<void> {
    await this.prisma.analyticsEvent.create({
      data: {
        id: uuidv4(),
        eventName: event.eventName,
        eventCategory: event.eventCategory || this.categorizeEvent(event.eventName),
        userId: event.userId,
        anonymousId: event.anonymousId,
        sessionId: event.sessionId,
        businessId: event.businessId,
        productId: event.productId,
        orderId: event.orderId,
        properties: event.properties || {},
        utmSource: event.utmSource,
        utmMedium: event.utmMedium,
        utmCampaign: event.utmCampaign,
        referrer: event.referrer,
        deviceType: event.deviceType,
        platform: event.platform,
        appVersion: event.appVersion,
        country: event.country,
        city: event.city,
        clientTimestamp: event.clientTimestamp,
      },
    });

    // Update aggregates asynchronously
    this.updateAggregates(event).catch((e) =>
      this.logger.error(`Aggregate update failed: ${e.message}`),
    );
  }

  /**
   * Track page view
   */
  async trackPageView(pageView: PageViewDto): Promise<void> {
    await this.prisma.pageView.create({
      data: {
        id: uuidv4(),
        ...pageView,
      },
    });

    // Update session
    await this.updateSession(pageView.sessionId, pageView);
  }

  /**
   * Track batch events
   */
  async trackBatch(events: TrackEventDto[]): Promise<void> {
    const data = events.map((event) => ({
      id: uuidv4(),
      eventName: event.eventName,
      eventCategory: event.eventCategory || this.categorizeEvent(event.eventName),
      userId: event.userId,
      anonymousId: event.anonymousId,
      sessionId: event.sessionId,
      businessId: event.businessId,
      productId: event.productId,
      orderId: event.orderId,
      properties: event.properties || {},
      utmSource: event.utmSource,
      utmMedium: event.utmMedium,
      utmCampaign: event.utmCampaign,
      referrer: event.referrer,
      deviceType: event.deviceType,
      platform: event.platform,
      appVersion: event.appVersion,
      country: event.country,
      city: event.city,
      clientTimestamp: event.clientTimestamp,
    }));

    await this.prisma.analyticsEvent.createMany({ data });
  }

  // =====================================================
  // SESSION MANAGEMENT
  // =====================================================

  /**
   * Start a new session
   */
  async startSession(data: {
    sessionId: string;
    userId?: string;
    anonymousId?: string;
    entryPage?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    referrer?: string;
    deviceType?: string;
    platform?: string;
    browser?: string;
    country?: string;
    city?: string;
  }): Promise<void> {
    await this.prisma.userSession.upsert({
      where: { sessionId: data.sessionId },
      create: {
        id: uuidv4(),
        ...data,
      },
      update: {
        userId: data.userId,
      },
    });
  }

  /**
   * End a session
   */
  async endSession(sessionId: string): Promise<void> {
    const session = await this.prisma.userSession.findUnique({
      where: { sessionId },
    });

    if (session) {
      const duration = Math.floor(
        (Date.now() - session.startedAt.getTime()) / 1000,
      );

      await this.prisma.userSession.update({
        where: { sessionId },
        data: {
          endedAt: new Date(),
          durationSeconds: duration,
        },
      });
    }
  }

  private async updateSession(
    sessionId: string,
    pageView: PageViewDto,
  ): Promise<void> {
    await this.prisma.userSession.update({
      where: { sessionId },
      data: {
        pageViews: { increment: 1 },
        exitPage: pageView.pagePath,
      },
    }).catch(() => {
      // Session might not exist yet, create it
      this.startSession({
        sessionId,
        userId: pageView.userId,
        anonymousId: pageView.anonymousId,
        entryPage: pageView.pagePath,
        deviceType: pageView.deviceType,
        platform: pageView.platform,
      });
    });
  }

  // =====================================================
  // PLATFORM ANALYTICS
  // =====================================================

  /**
   * Get platform overview stats
   */
  async getPlatformStats(range: DateRange): Promise<{
    totalUsers: number;
    newUsers: number;
    sessions: number;
    pageViews: number;
    avgSessionDuration: number;
    bounceRate: number;
    conversionRate: number;
    revenue: number;
  }> {
    const { startDate, endDate } = range;

    // Users
    const [totalUsers, newUsers] = await Promise.all([
      this.prisma.user.count({
        where: { createdAt: { lte: endDate } },
      }),
      this.prisma.user.count({
        where: { createdAt: { gte: startDate, lte: endDate } },
      }),
    ]);

    // Sessions
    const sessions = await this.prisma.userSession.aggregate({
      where: { startedAt: { gte: startDate, lte: endDate } },
      _count: true,
      _avg: { durationSeconds: true },
    });

    // Page views
    const pageViews = await this.prisma.pageView.count({
      where: { createdAt: { gte: startDate, lte: endDate } },
    });

    // Bounce rate (sessions with only 1 page view)
    const bouncedSessions = await this.prisma.userSession.count({
      where: {
        startedAt: { gte: startDate, lte: endDate },
        pageViews: 1,
      },
    });

    // Conversions (orders)
    const orders = await this.prisma.order.aggregate({
      where: { 
        createdAt: { gte: startDate, lte: endDate },
        paymentStatus: 'paid',
      },
      _count: true,
      _sum: { totalAmount: true },
    });

    const sessionCount = sessions._count || 1;
    const bounceRate = (bouncedSessions / sessionCount) * 100;
    const conversionRate = (orders._count / sessionCount) * 100;

    return {
      totalUsers,
      newUsers,
      sessions: sessionCount,
      pageViews,
      avgSessionDuration: Math.round(sessions._avg.durationSeconds || 0),
      bounceRate: Math.round(bounceRate * 10) / 10,
      conversionRate: Math.round(conversionRate * 100) / 100,
      revenue: orders._sum.totalAmount || 0,
    };
  }

  /**
   * Get daily stats for charts
   */
  async getDailyStats(
    range: DateRange,
    metrics: string[] = ['sessions', 'pageViews', 'orders', 'revenue'],
  ): Promise<Array<{
    date: string;
    [key: string]: any;
  }>> {
    const { startDate, endDate } = range;

    // Get from materialized view for performance
    const stats = await this.prisma.$queryRaw<any[]>`
      SELECT 
        date::TEXT,
        sessions,
        page_views as "pageViews",
        purchases as orders,
        revenue
      FROM mv_daily_platform_stats
      WHERE date >= ${startDate}::DATE AND date <= ${endDate}::DATE
      ORDER BY date ASC
    `;

    return stats;
  }

  /**
   * Get top pages
   */
  async getTopPages(
    range: DateRange,
    limit: number = 10,
  ): Promise<Array<{
    pagePath: string;
    pageType: string;
    views: number;
    uniqueVisitors: number;
    avgTimeOnPage: number;
  }>> {
    const { startDate, endDate } = range;

    const pages = await this.prisma.$queryRaw<any[]>`
      SELECT 
        page_path as "pagePath",
        page_type as "pageType",
        COUNT(*) as views,
        COUNT(DISTINCT COALESCE(user_id::TEXT, anonymous_id)) as "uniqueVisitors",
        AVG(time_on_page) as "avgTimeOnPage"
      FROM page_views
      WHERE created_at >= ${startDate} AND created_at <= ${endDate}
      GROUP BY page_path, page_type
      ORDER BY views DESC
      LIMIT ${limit}
    `;

    return pages.map((p) => ({
      ...p,
      views: Number(p.views),
      uniqueVisitors: Number(p.uniqueVisitors),
      avgTimeOnPage: Math.round(Number(p.avgTimeOnPage) || 0),
    }));
  }

  /**
   * Get traffic sources
   */
  async getTrafficSources(range: DateRange): Promise<Array<{
    source: string;
    sessions: number;
    percentage: number;
  }>> {
    const { startDate, endDate } = range;

    const sources = await this.prisma.$queryRaw<any[]>`
      SELECT 
        COALESCE(utm_source, 
          CASE 
            WHEN referrer IS NULL THEN 'direct'
            WHEN referrer LIKE '%google%' THEN 'google'
            WHEN referrer LIKE '%facebook%' THEN 'facebook'
            WHEN referrer LIKE '%twitter%' THEN 'twitter'
            WHEN referrer LIKE '%whatsapp%' THEN 'whatsapp'
            ELSE 'other'
          END
        ) as source,
        COUNT(*) as sessions
      FROM user_sessions
      WHERE started_at >= ${startDate} AND started_at <= ${endDate}
      GROUP BY source
      ORDER BY sessions DESC
    `;

    const total = sources.reduce((sum, s) => sum + Number(s.sessions), 0);

    return sources.map((s) => ({
      source: s.source,
      sessions: Number(s.sessions),
      percentage: Math.round((Number(s.sessions) / total) * 1000) / 10,
    }));
  }

  // =====================================================
  // BUSINESS ANALYTICS
  // =====================================================

  /**
   * Get business dashboard stats
   */
  async getBusinessStats(
    businessId: string,
    range: DateRange,
  ): Promise<{
    profileViews: number;
    uniqueVisitors: number;
    productViews: number;
    followers: number;
    newFollowers: number;
    orders: number;
    revenue: number;
    conversionRate: number;
  }> {
    const { startDate, endDate } = range;

    // Aggregate from daily stats
    const stats = await this.prisma.businessAnalyticsDaily.aggregate({
      where: {
        businessId,
        date: { gte: startDate, lte: endDate },
      },
      _sum: {
        profileViews: true,
        uniqueVisitors: true,
        productViews: true,
        newFollowers: true,
        orders: true,
        revenue: true,
      },
    });

    // Current followers
    const followers = await this.prisma.businessFollower.count({
      where: { businessId },
    });

    const profileViews = stats._sum.profileViews || 0;
    const orders = stats._sum.orders || 0;

    return {
      profileViews,
      uniqueVisitors: stats._sum.uniqueVisitors || 0,
      productViews: stats._sum.productViews || 0,
      followers,
      newFollowers: stats._sum.newFollowers || 0,
      orders,
      revenue: stats._sum.revenue || 0,
      conversionRate: profileViews > 0 
        ? Math.round((orders / profileViews) * 10000) / 100 
        : 0,
    };
  }

  /**
   * Get business daily stats for charts
   */
  async getBusinessDailyStats(
    businessId: string,
    range: DateRange,
  ): Promise<any[]> {
    return this.prisma.businessAnalyticsDaily.findMany({
      where: {
        businessId,
        date: { gte: range.startDate, lte: range.endDate },
      },
      orderBy: { date: 'asc' },
    });
  }

  /**
   * Get top products for business
   */
  async getBusinessTopProducts(
    businessId: string,
    range: DateRange,
    limit: number = 10,
  ): Promise<any[]> {
    const products = await this.prisma.$queryRaw<any[]>`
      SELECT 
        p.id,
        p.name,
        SUM(pa.views) as views,
        SUM(pa.orders) as orders,
        SUM(pa.revenue) as revenue
      FROM product_analytics_daily pa
      JOIN products p ON p.id = pa.product_id
      WHERE p.business_id = ${businessId}::UUID
        AND pa.date >= ${range.startDate}::DATE
        AND pa.date <= ${range.endDate}::DATE
      GROUP BY p.id, p.name
      ORDER BY revenue DESC
      LIMIT ${limit}
    `;

    return products;
  }

  // =====================================================
  // PRODUCT ANALYTICS
  // =====================================================

  /**
   * Get product stats
   */
  async getProductStats(
    productId: string,
    range: DateRange,
  ): Promise<{
    views: number;
    uniqueViewers: number;
    addToCarts: number;
    orders: number;
    revenue: number;
    conversionRate: number;
  }> {
    const stats = await this.prisma.productAnalyticsDaily.aggregate({
      where: {
        productId,
        date: { gte: range.startDate, lte: range.endDate },
      },
      _sum: {
        views: true,
        uniqueViewers: true,
        addToCart: true,
        orders: true,
        revenue: true,
      },
    });

    const views = stats._sum.views || 0;
    const orders = stats._sum.orders || 0;

    return {
      views,
      uniqueViewers: stats._sum.uniqueViewers || 0,
      addToCarts: stats._sum.addToCart || 0,
      orders,
      revenue: stats._sum.revenue || 0,
      conversionRate: views > 0 
        ? Math.round((orders / views) * 10000) / 100 
        : 0,
    };
  }

  // =====================================================
  // SEARCH ANALYTICS
  // =====================================================

  /**
   * Get top searches
   */
  async getTopSearches(
    range: DateRange,
    limit: number = 20,
  ): Promise<Array<{
    query: string;
    count: number;
    avgResults: number;
    clickRate: number;
  }>> {
    const { startDate, endDate } = range;

    const searches = await this.prisma.$queryRaw<any[]>`
      SELECT 
        normalized_query as query,
        COUNT(*) as count,
        AVG(results_count) as "avgResults",
        COUNT(clicked_product_id)::FLOAT / COUNT(*)::FLOAT * 100 as "clickRate"
      FROM search_analytics
      WHERE created_at >= ${startDate} AND created_at <= ${endDate}
      GROUP BY normalized_query
      ORDER BY count DESC
      LIMIT ${limit}
    `;

    return searches.map((s) => ({
      query: s.query,
      count: Number(s.count),
      avgResults: Math.round(Number(s.avgResults)),
      clickRate: Math.round(Number(s.clickRate) * 10) / 10,
    }));
  }

  /**
   * Get zero result searches
   */
  async getZeroResultSearches(
    range: DateRange,
    limit: number = 20,
  ): Promise<Array<{ query: string; count: number }>> {
    const { startDate, endDate } = range;

    return this.prisma.$queryRaw`
      SELECT 
        normalized_query as query,
        COUNT(*) as count
      FROM search_analytics
      WHERE created_at >= ${startDate} 
        AND created_at <= ${endDate}
        AND results_count = 0
      GROUP BY normalized_query
      ORDER BY count DESC
      LIMIT ${limit}
    `;
  }

  // =====================================================
  // FUNNEL ANALYTICS
  // =====================================================

  /**
   * Get funnel conversion
   */
  async getFunnelConversion(
    funnelName: string,
    range: DateRange,
  ): Promise<Array<{
    step: string;
    users: number;
    conversionRate: number;
    dropoffRate: number;
  }>> {
    const { startDate, endDate } = range;

    const steps = await this.prisma.$queryRaw<any[]>`
      SELECT 
        step_name as step,
        step_order,
        COUNT(DISTINCT COALESCE(user_id::TEXT, anonymous_id)) as users
      FROM funnel_events
      WHERE funnel_name = ${funnelName}
        AND created_at >= ${startDate}
        AND created_at <= ${endDate}
      GROUP BY step_name, step_order
      ORDER BY step_order ASC
    `;

    return steps.map((step, index) => {
      const users = Number(step.users);
      const prevUsers = index > 0 ? Number(steps[index - 1].users) : users;
      const firstStepUsers = Number(steps[0]?.users || 1);

      return {
        step: step.step,
        users,
        conversionRate: Math.round((users / firstStepUsers) * 1000) / 10,
        dropoffRate: index > 0 
          ? Math.round(((prevUsers - users) / prevUsers) * 1000) / 10 
          : 0,
      };
    });
  }

  // =====================================================
  // HELPERS
  // =====================================================

  private categorizeEvent(eventName: string): string {
    const categories: Record<string, string[]> = {
      page_view: ['page_view', 'screen_view'],
      action: ['click', 'tap', 'scroll', 'search', 'share', 'like', 'comment'],
      conversion: ['purchase', 'signup', 'subscribe', 'add_to_cart', 'checkout'],
      error: ['error', 'crash', 'exception'],
    };

    for (const [category, events] of Object.entries(categories)) {
      if (events.some((e) => eventName.toLowerCase().includes(e))) {
        return category;
      }
    }

    return 'other';
  }

  private async updateAggregates(event: TrackEventDto): Promise<void> {
    // Update product analytics
    if (event.productId) {
      const metricMap: Record<string, string> = {
        'product_view': 'views',
        'add_to_cart': 'add_to_cart',
        'add_to_wishlist': 'add_to_wishlist',
        'share_product': 'shares',
        'purchase': 'orders',
      };

      const metric = metricMap[event.eventName];
      if (metric) {
        await this.prisma.$queryRaw`
          SELECT increment_product_metric(${event.productId}::UUID, ${metric}, 1)
        `;
      }

      // Track revenue
      if (event.eventName === 'purchase' && event.properties?.amount) {
        await this.prisma.$queryRaw`
          SELECT increment_product_metric(
            ${event.productId}::UUID, 
            'revenue', 
            ${event.properties.amount}::INTEGER
          )
        `;
      }
    }

    // Update business analytics
    if (event.businessId) {
      const metricMap: Record<string, string> = {
        'business_view': 'profile_views',
        'product_view': 'product_views',
        'whatsapp_click': 'whatsapp_clicks',
        'phone_click': 'phone_clicks',
        'share_business': 'share_clicks',
        'follow': 'new_followers',
        'unfollow': 'unfollows',
        'purchase': 'orders',
      };

      const metric = metricMap[event.eventName];
      if (metric) {
        await this.prisma.$queryRaw`
          SELECT increment_business_metric(${event.businessId}::UUID, ${metric}, 1)
        `;
      }
    }
  }
}
