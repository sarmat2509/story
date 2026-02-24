# DuckDNS Setup Instructions

## Domain Configuration

**Domain:** `magic-sleep-time.duckdns.org`

## Quick Setup on Droplet

### 1. Update DuckDNS IP (one-time)

On DuckDNS website (https://www.duckdns.org/domains):
- Set "current ip" to your droplet IP address
- Click "update ip"

### 2. Get SSL Certificate

```bash
cd /var/www/kazka

# Install certbot
apt install -y certbot

# Create certbot directories
mkdir -p certbot/www certbot/conf

# Get certificate
certbot certonly --webroot \
  -w ./certbot/www \
  -d magic-sleep-time.duckdns.org \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email
```

### 3. Enable HTTPS in nginx

Edit `nginx/conf.d/kazka.conf` and uncomment the HTTPS section (remove `#` at the beginning of lines 43-75).

Also uncomment the redirect in HTTP section (line 10):
```nginx
return 301 https://$server_name$request_uri;
```

### 4. Restart nginx

```bash
docker-compose -f docker-compose.prod.yml restart nginx
```

### 5. Setup Automatic IP Update (in case of IP change)

Get your DuckDNS token from: https://www.duckdns.org/domains (top of the page)

Add to crontab:
```bash
crontab -e
```

Add these lines:
```bash
# Update DuckDNS IP every 5 minutes
*/5 * * * * curl "https://www.duckdns.org/update?domains=magic-sleep-time&token=YOUR_DUCKDNS_TOKEN&ip=" >/dev/null 2>&1

# Renew SSL certificate daily at 3 AM
0 3 * * * certbot renew --quiet && docker-compose -f /var/www/kazka/docker-compose.prod.yml restart nginx
```

Replace `YOUR_DUCKDNS_TOKEN` with your actual token.

## Testing

```bash
# Test HTTP (should redirect to HTTPS after SSL setup)
curl http://magic-sleep-time.duckdns.org/health

# Test HTTPS
curl https://magic-sleep-time.duckdns.org/health
```

## OAuth Provider Configuration

Update callback URLs in:

**Google Cloud Console:**
- Authorized redirect URIs: `https://magic-sleep-time.duckdns.org/api/v1/auth/google/callback`

**Apple Developer:**
- Return URLs: `https://magic-sleep-time.duckdns.org/api/v1/auth/apple/callback`

## Notes

- DuckDNS is free and works great for testing/staging
- SSL certificate auto-renews every 90 days via cron
- The domain will remain active as long as you keep your DuckDNS account
