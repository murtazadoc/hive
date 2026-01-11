import { useEffect } from 'react';
import { Linking, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// =====================================================
// DEEP LINK CONFIG
// =====================================================
export const DEEP_LINK_CONFIG = {
  prefixes: [
    'hive://',
    'https://hive.co.ke',
    'https://www.hive.co.ke',
    'https://app.hive.co.ke',
  ],
  config: {
    screens: {
      // Main app screens
      Home: '',
      
      // Products
      ProductDetail: {
        path: 'products/:productId',
        parse: { productId: (id: string) => id },
      },
      ProductCategory: {
        path: 'categories/:categoryId',
        parse: { categoryId: (id: string) => id },
      },
      
      // Businesses
      BusinessDetail: {
        path: 'businesses/:businessId',
        parse: { businessId: (id: string) => id },
      },
      BusinessProfile: {
        path: 'b/:slug',
        parse: { slug: (slug: string) => slug },
      },
      
      // Reels
      ReelDetail: {
        path: 'reels/:reelId',
        parse: { reelId: (id: string) => id },
      },
      ReelsFeed: 'reels',
      
      // Search
      Search: {
        path: 'search',
        parse: { q: (query: string) => query },
      },
      
      // Short links (handled specially)
      ShortLink: {
        path: 's/:code',
        parse: { code: (code: string) => code },
      },
      
      // Auth
      Login: 'login',
      Register: 'register',
      ResetPassword: {
        path: 'reset-password/:token',
        parse: { token: (token: string) => token },
      },
      
      // Orders
      OrderDetail: {
        path: 'orders/:orderId',
        parse: { orderId: (id: string) => id },
      },
    },
  },
};

// =====================================================
// DEEP LINK HANDLER HOOK
// =====================================================
export function useDeepLinkHandler() {
  const navigation = useNavigation<any>();

  useEffect(() => {
    // Handle initial URL (app opened via link)
    const handleInitialURL = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        handleDeepLink(initialUrl);
      }
    };

    // Handle incoming URLs (app already open)
    const subscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    handleInitialURL();

    return () => {
      subscription.remove();
    };
  }, []);

  const handleDeepLink = async (url: string) => {
    console.log('Deep link received:', url);

    try {
      const parsed = parseDeepLink(url);
      
      if (!parsed) {
        console.log('Could not parse deep link');
        return;
      }

      // Store attribution data
      if (parsed.utmParams) {
        await storeAttribution(parsed.utmParams);
      }

      // Navigate based on parsed route
      switch (parsed.screen) {
        case 'ProductDetail':
          navigation.navigate('ProductDetail', { productId: parsed.params.productId });
          break;

        case 'BusinessDetail':
          navigation.navigate('BusinessDetail', { businessId: parsed.params.businessId });
          break;

        case 'BusinessProfile':
          navigation.navigate('BusinessProfile', { slug: parsed.params.slug });
          break;

        case 'ReelDetail':
          navigation.navigate('ReelDetail', { reelId: parsed.params.reelId });
          break;

        case 'Search':
          navigation.navigate('Search', { query: parsed.params.q });
          break;

        case 'ShortLink':
          // Short links are resolved server-side, but we can handle them client-side too
          await handleShortLink(parsed.params.code);
          break;

        case 'OrderDetail':
          navigation.navigate('OrderDetail', { orderId: parsed.params.orderId });
          break;

        case 'ResetPassword':
          navigation.navigate('ResetPassword', { token: parsed.params.token });
          break;

        default:
          navigation.navigate('Home');
      }
    } catch (error) {
      console.error('Error handling deep link:', error);
    }
  };

  const handleShortLink = async (code: string) => {
    try {
      // Resolve short link via API
      const response = await fetch(`https://hive.co.ke/s/${code}/info`);
      const data = await response.json();

      switch (data.targetType) {
        case 'product':
          navigation.navigate('ProductDetail', { productId: data.targetId });
          break;
        case 'business':
          navigation.navigate('BusinessDetail', { businessId: data.targetId });
          break;
        case 'reel':
          navigation.navigate('ReelDetail', { reelId: data.targetId });
          break;
        default:
          navigation.navigate('Home');
      }
    } catch (error) {
      console.error('Error resolving short link:', error);
      navigation.navigate('Home');
    }
  };

  return { handleDeepLink };
}

// =====================================================
// PARSE DEEP LINK
// =====================================================
interface ParsedDeepLink {
  screen: string;
  params: Record<string, string>;
  utmParams?: {
    source?: string;
    medium?: string;
    campaign?: string;
  };
}

function parseDeepLink(url: string): ParsedDeepLink | null {
  try {
    // Handle custom scheme
    if (url.startsWith('hive://')) {
      url = url.replace('hive://', 'https://hive.co.ke/');
    }

    const urlObj = new URL(url);
    const path = urlObj.pathname;
    const params = Object.fromEntries(urlObj.searchParams);

    // Extract UTM params
    const utmParams = {
      source: params.utm_source,
      medium: params.utm_medium,
      campaign: params.utm_campaign,
    };

    // Match routes
    const routes = [
      { pattern: /^\/products\/([^\/]+)$/, screen: 'ProductDetail', param: 'productId' },
      { pattern: /^\/businesses\/([^\/]+)$/, screen: 'BusinessDetail', param: 'businessId' },
      { pattern: /^\/b\/([^\/]+)$/, screen: 'BusinessProfile', param: 'slug' },
      { pattern: /^\/reels\/([^\/]+)$/, screen: 'ReelDetail', param: 'reelId' },
      { pattern: /^\/reels\/?$/, screen: 'ReelsFeed', param: null },
      { pattern: /^\/search\/?$/, screen: 'Search', param: null },
      { pattern: /^\/s\/([^\/]+)$/, screen: 'ShortLink', param: 'code' },
      { pattern: /^\/orders\/([^\/]+)$/, screen: 'OrderDetail', param: 'orderId' },
      { pattern: /^\/reset-password\/([^\/]+)$/, screen: 'ResetPassword', param: 'token' },
      { pattern: /^\/categories\/([^\/]+)$/, screen: 'ProductCategory', param: 'categoryId' },
    ];

    for (const route of routes) {
      const match = path.match(route.pattern);
      if (match) {
        return {
          screen: route.screen,
          params: route.param ? { [route.param]: match[1], ...params } : params,
          utmParams,
        };
      }
    }

    // Default to home
    return {
      screen: 'Home',
      params,
      utmParams,
    };
  } catch (error) {
    console.error('Error parsing deep link:', error);
    return null;
  }
}

// =====================================================
// ATTRIBUTION STORAGE
// =====================================================
const ATTRIBUTION_KEY = '@hive_attribution';

async function storeAttribution(utmParams: {
  source?: string;
  medium?: string;
  campaign?: string;
}): Promise<void> {
  if (!utmParams.source && !utmParams.medium && !utmParams.campaign) {
    return;
  }

  const attribution = {
    ...utmParams,
    timestamp: Date.now(),
  };

  await AsyncStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution));
}

export async function getAttribution(): Promise<{
  source?: string;
  medium?: string;
  campaign?: string;
  timestamp?: number;
} | null> {
  try {
    const data = await AsyncStorage.getItem(ATTRIBUTION_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      // Attribution expires after 30 days
      if (Date.now() - parsed.timestamp < 30 * 24 * 60 * 60 * 1000) {
        return parsed;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function clearAttribution(): Promise<void> {
  await AsyncStorage.removeItem(ATTRIBUTION_KEY);
}

// =====================================================
// GENERATE DEEP LINKS
// =====================================================
export function generateDeepLink(
  type: 'product' | 'business' | 'reel' | 'category' | 'search',
  id: string,
  options?: {
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    useScheme?: boolean;
  },
): string {
  const base = options?.useScheme ? 'hive://' : 'https://hive.co.ke/';
  
  let path: string;
  switch (type) {
    case 'product':
      path = `products/${id}`;
      break;
    case 'business':
      path = `businesses/${id}`;
      break;
    case 'reel':
      path = `reels/${id}`;
      break;
    case 'category':
      path = `categories/${id}`;
      break;
    case 'search':
      path = `search?q=${encodeURIComponent(id)}`;
      break;
    default:
      path = '';
  }

  let url = `${base}${path}`;

  // Add UTM params
  const utmParams = [];
  if (options?.utmSource) utmParams.push(`utm_source=${options.utmSource}`);
  if (options?.utmMedium) utmParams.push(`utm_medium=${options.utmMedium}`);
  if (options?.utmCampaign) utmParams.push(`utm_campaign=${options.utmCampaign}`);

  if (utmParams.length > 0) {
    url += (url.includes('?') ? '&' : '?') + utmParams.join('&');
  }

  return url;
}

// =====================================================
// UNIVERSAL LINKS CONFIG (iOS)
// =====================================================
export const APPLE_APP_SITE_ASSOCIATION = {
  applinks: {
    apps: [],
    details: [
      {
        appID: 'TEAM_ID.co.ke.hive.app',
        paths: [
          '/products/*',
          '/businesses/*',
          '/b/*',
          '/reels/*',
          '/s/*',
          '/categories/*',
          '/search',
          '/orders/*',
        ],
      },
    ],
  },
};

// =====================================================
// APP LINKS CONFIG (Android)
// =====================================================
export const ANDROID_ASSET_LINKS = [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'co.ke.hive.app',
      sha256_cert_fingerprints: [
        // Add your app's SHA256 fingerprint here
        'YOUR_SHA256_FINGERPRINT',
      ],
    },
  },
];
