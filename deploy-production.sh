#!/bin/bash

# HRMS Biometric System - Production Deployment Script
# Usage: ./deploy-production.sh [domain] [database_name]

DOMAIN=${1:-"yourdomain.com"}
DB_NAME=${2:-"u818562152_ecpayroll"}

echo "🚀 Deploying HRMS Biometric System to Production"
echo "Domain: $DOMAIN"
echo "Database: $DB_NAME"

# 1. Backup current configuration
echo "📦 Creating backup..."
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

# 2. Update environment configuration
echo "⚙️  Updating environment configuration..."
sed -i "s/APP_ENV=local/APP_ENV=production/" .env
sed -i "s/APP_DEBUG=true/APP_DEBUG=false/" .env
sed -i "s/APP_URL=/APP_URL=https:\/\/$DOMAIN/" .env
sed -i "s/LOG_LEVEL=debug/LOG_LEVEL=error/" .env

# Uncomment production database settings
sed -i 's/^#DB_CONNECTION=mysql/DB_CONNECTION=mysql/' .env
sed -i 's/^#DB_HOST=localhost/DB_HOST=localhost/' .env
sed -i 's/^#DB_DATABASE=u818562152_ecpayroll/DB_DATABASE='$DB_NAME'/' .env
sed -i 's/^#DB_USERNAME=u818562152_ecpayroll/DB_USERNAME='$DB_NAME'/' .env
sed -i 's/^#DB_PASSWORD=H@sh\$\$\$123/DB_PASSWORD=H@sh\$\$\$123/' .env

# Comment out local database settings  
sed -i 's/^DB_CONNECTION=mysql/#DB_CONNECTION=mysql/' .env
sed -i 's/^DB_HOST=127.0.0.1/#DB_HOST=127.0.0.1/' .env

# 3. Clear and optimize caches
echo "🧹 Clearing caches..."
php artisan config:clear
php artisan cache:clear
php artisan route:clear
php artisan view:clear

# 4. Run migrations
echo "🗄️  Running database migrations..."
php artisan migrate --force

# 5. Optimize for production
echo "⚡ Optimizing for production..."
php artisan config:cache
php artisan route:cache
php artisan view:cache

# 6. Set permissions
echo "🔐 Setting file permissions..."
chmod -R 755 storage/
chmod -R 755 bootstrap/cache/
chown -R www-data:www-data storage/
chown -R www-data:www-data bootstrap/cache/

# 7. Test critical functionality
echo "🧪 Testing critical functionality..."
php artisan tinker --execute="echo 'Socket extension: ' . (extension_loaded('sockets') ? 'OK' : 'MISSING'); echo PHP_EOL;"
php artisan tinker --execute="echo 'Database: ' . (DB::connection()->getPdo() ? 'Connected' : 'Failed'); echo PHP_EOL;"

echo "✅ Production deployment completed!"
echo ""
echo "📋 Next Steps:"
echo "1. Update your domain DNS to point to this server"
echo "2. Configure SSL certificate (Let's Encrypt recommended)"
echo "3. Test biometric device connectivity from: https://$DOMAIN/biometric-devices"
echo "4. Monitor logs: tail -f storage/logs/laravel.log"
echo ""
echo "🔧 Biometric Device Network Setup:"
echo "- Ensure devices can reach https://$DOMAIN"
echo "- Configure firewall to allow port 4370 if using direct connection"
echo "- Test connection from device network: curl -I https://$DOMAIN"