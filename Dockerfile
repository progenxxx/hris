# QPAL - Corrected Laravel Dockerfile for Railway

FROM php:8.2-apache

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    libpng-dev \
    libjpeg-dev \
    libfreetype6-dev \
    libzip-dev \
    libicu-dev \
    zip \
    unzip \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Configure and install PHP extensions
RUN docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j$(nproc) \
        pdo_mysql \
        bcmath \
        gd \
        zip \
        intl

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Enable Apache mod_rewrite (moved earlier)
RUN a2enmod rewrite

# Set working directory
WORKDIR /var/www/html

# Copy application files
COPY . .

# Create environment file for build
RUN echo "APP_NAME=Laravel" > .env && \
    echo "APP_ENV=production" >> .env && \
    echo "APP_KEY=" >> .env && \
    echo "APP_DEBUG=false" >> .env && \
    echo "APP_URL=http://localhost" >> .env && \
    echo "VITE_APP_NAME=Laravel" >> .env

# Install PHP dependencies
RUN composer install --no-dev --optimize-autoloader --no-interaction --ignore-platform-reqs

# Generate Laravel application key
RUN php artisan key:generate --no-interaction

# Install Node.js dependencies and build assets
RUN npm ci && npm run build && rm -rf node_modules

# Configure Apache DocumentRoot to point to Laravel's public directory
ENV APACHE_DOCUMENT_ROOT=/var/www/html/public
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf
RUN sed -ri -e 's!/var/www/!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf

# Set proper permissions
RUN chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache
RUN chmod -R 775 /var/www/html/storage /var/www/html/bootstrap/cache

# Fix Apache FQDN warning
RUN echo "ServerName localhost" >> /etc/apache2/apache2.conf

# Cache Laravel configuration (moved after key generation)
RUN php artisan config:cache && \
    php artisan route:cache && \
    php artisan view:cache

EXPOSE 80

CMD ["apache2-foreground"]