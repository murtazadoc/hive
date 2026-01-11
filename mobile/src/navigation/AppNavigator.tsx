import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Feather';

// Auth Screens
import WelcomeScreen from '../screens/auth/WelcomeScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import OtpScreen from '../screens/auth/OtpScreen';

// Main Screens
import HomeScreen from '../screens/main/HomeScreen';
import ExploreScreen from '../screens/main/ExploreScreen';
import ProfileScreen from '../screens/main/ProfileScreen';

// Business Screens
import CreateBusinessScreen from '../screens/business/CreateBusinessScreen';
import BusinessDetailScreen from '../screens/business/BusinessDetailScreen';
import MyBusinessesScreen from '../screens/business/MyBusinessesScreen';

// Product Screens
import ProductsListScreen from '../screens/products/ProductsListScreen';
import ProductDetailScreen from '../screens/products/ProductDetailScreen';
import CreateProductScreen from '../screens/products/CreateProductScreen';

// Store
import { useAuthStore } from '../store/authStore';

// =====================================================
// STACK TYPES
// =====================================================
export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
  Otp: { phoneNumber: string; purpose: 'registration' | 'login' | 'password_reset' };
};

export type MainTabParamList = {
  Home: undefined;
  Explore: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  AuthStack: undefined;
  MainTabs: undefined;
  CreateBusiness: undefined;
  BusinessDetail: { businessId: string };
  MyBusinesses: undefined;
  // Product routes
  Products: { businessId: string };
  ProductDetail: { businessId: string; productId: string };
  CreateProduct: { businessId: string; productId?: string };
};

// =====================================================
// NAVIGATORS
// =====================================================
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainTab = createBottomTabNavigator<MainTabParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();

// Auth Navigator
function AuthNavigator() {
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen name="Otp" component={OtpScreen} />
    </AuthStack.Navigator>
  );
}

// Main Tab Navigator
function MainTabNavigator() {
  return (
    <MainTab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: string;

          switch (route.name) {
            case 'Home':
              iconName = 'home';
              break;
            case 'Explore':
              iconName = 'search';
              break;
            case 'Profile':
              iconName = 'user';
              break;
            default:
              iconName = 'circle';
          }

          return <Icon name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#F59E0B', // Amber/Honey color for Hive
        tabBarInactiveTintColor: '#6B7280',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E5E7EB',
          paddingBottom: 5,
          paddingTop: 5,
          height: 60,
        },
        headerShown: false,
      })}
    >
      <MainTab.Screen name="Home" component={HomeScreen} />
      <MainTab.Screen name="Explore" component={ExploreScreen} />
      <MainTab.Screen name="Profile" component={ProfileScreen} />
    </MainTab.Navigator>
  );
}

// Root Navigator
function RootNavigator() {
  const { isAuthenticated } = useAuthStore();

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {!isAuthenticated ? (
        <RootStack.Screen name="AuthStack" component={AuthNavigator} />
      ) : (
        <>
          <RootStack.Screen name="MainTabs" component={MainTabNavigator} />
          <RootStack.Screen
            name="CreateBusiness"
            component={CreateBusinessScreen}
            options={{
              headerShown: true,
              title: 'Create Business',
              headerStyle: { backgroundColor: '#F59E0B' },
              headerTintColor: '#FFFFFF',
            }}
          />
          <RootStack.Screen
            name="BusinessDetail"
            component={BusinessDetailScreen}
            options={{
              headerShown: true,
              title: 'Business',
              headerStyle: { backgroundColor: '#F59E0B' },
              headerTintColor: '#FFFFFF',
            }}
          />
          <RootStack.Screen
            name="MyBusinesses"
            component={MyBusinessesScreen}
            options={{
              headerShown: true,
              title: 'My Businesses',
              headerStyle: { backgroundColor: '#F59E0B' },
              headerTintColor: '#FFFFFF',
            }}
          />
          <RootStack.Screen
            name="Products"
            component={ProductsListScreen}
            options={{
              headerShown: true,
              title: 'Products',
              headerStyle: { backgroundColor: '#F59E0B' },
              headerTintColor: '#FFFFFF',
            }}
          />
          <RootStack.Screen
            name="ProductDetail"
            component={ProductDetailScreen}
            options={{
              headerShown: true,
              title: 'Product',
              headerStyle: { backgroundColor: '#F59E0B' },
              headerTintColor: '#FFFFFF',
            }}
          />
          <RootStack.Screen
            name="CreateProduct"
            component={CreateProductScreen}
            options={{
              headerShown: true,
              title: 'Add Product',
              headerStyle: { backgroundColor: '#F59E0B' },
              headerTintColor: '#FFFFFF',
            }}
          />
        </>
      )}
    </RootStack.Navigator>
  );
}

// Main App Navigation
export default function AppNavigator() {
  return (
    <NavigationContainer>
      <RootNavigator />
    </NavigationContainer>
  );
}
