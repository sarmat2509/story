#!/bin/bash

set -e

echo "🚀 Setting up WonderTales development environment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

echo "✅ Docker is running"

# Start Docker services
echo "📦 Starting PostgreSQL and Adminer..."
docker-compose up -d

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 10

# Check if PostgreSQL is ready
until docker exec wondertales-postgres pg_isready -U kazka > /dev/null 2>&1; do
    echo "⏳ Still waiting for PostgreSQL..."
    sleep 2
done

echo "✅ PostgreSQL is ready"

# Run migrations
echo "🗄️  Running database migrations..."
cd services/api
pnpm drizzle-kit push:pg || {
    echo "❌ Migration failed. Make sure you ran 'pnpm install' first"
    exit 1
}
cd ../..

echo ""
echo "✅ Development environment is ready!"
echo ""
echo "📝 Next steps:"
echo "  1. Configure .env file with your OAuth credentials"
echo "  2. Run 'pnpm dev:api' to start the API server"
echo "  3. Visit http://localhost:3000/health to verify"
echo "  4. Visit http://localhost:8080 for Adminer (database UI)"
echo ""
echo "📚 Documentation:"
echo "  - API Docs: docs/api/auth.md"
echo "  - Architecture: docs/architecture.md"
echo ""
