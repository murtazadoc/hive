// =====================================================
// GLOBAL SETUP - Runs once before all tests
// =====================================================

module.exports = async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-key';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/hive_test';
  process.env.REDIS_URL = 'redis://localhost:6379/1';

  console.log('\n🧪 Setting up test environment...\n');
};
