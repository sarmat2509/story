# Deployment Guide - DigitalOcean

## Prerequisites

- DigitalOcean Droplet (Ubuntu 22.04, min 2GB RAM recommended, 4GB+ for production)
- Domain name pointing to droplet IP
- GitHub account with repo access

## Initial Server Setup

### 1. Connect to Droplet

```bash
ssh root@your-droplet-ip
```

### 2. Install Dependencies

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
apt install docker-compose-plugin -y

# Install Node.js & pnpm (for running migrations)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g pnpm

# Install PostgreSQL client (for backups)
apt install -y postgresql-client

# Install git (if not present)
apt install -y git
```

### 3. Clone Repository

```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/sarmat2509/story.git kazka
cd kazka
```

### 4. Configure Environment

```bash
# Copy environment template
cp .env.example .env.production

# Edit with your production values
nano .env.production
```

**IMPORTANT Environment Variables to Update:**

- `DATABASE_URL`: Set strong password for PostgreSQL
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`: Match DATABASE_URL
- `JWT_SECRET`: Generate 32+ character random string
- `ENCRYPTION_KEY`: Generate 64 character hex string
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: From Google Cloud Console
- `GOOGLE_CALLBACK_URL`: Update to your domain
- `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`: From Apple Developer
- `GEMINI_API_KEY`: From Google AI Studio
- `ELEVENLABS_API_KEY`: From ElevenLabs dashboard
- `GOOGLE_CLOUD_PROJECT`: Your GCP project ID
- Update nginx config: `nano nginx/conf.d/kazka.conf` - change `your-domain.com` to your actual domain

**Generate Secure Secrets:**

```bash
# Generate JWT_SECRET (32 chars)
openssl rand -base64 32

# Generate ENCRYPTION_KEY (64 hex chars)
openssl rand -hex 32
```

### 5. Setup Database

```bash
# Start PostgreSQL only
docker-compose -f docker-compose.prod.yml up -d postgres

# Wait for postgres to be ready
sleep 10

# Run migrations
cd services/api
pnpm install
pnpm db:push
psql $DATABASE_URL -f drizzle/add_updated_at_triggers.sql

# Optional: Seed voices data
pnpm seed:voices

cd ../..
```

### 6. Start All Services

```bash
docker-compose -f docker-compose.prod.yml up -d
```

Check logs:
```bash
docker logs kazka-api-prod -f
```

### 7. Setup SSL (Let's Encrypt)

```bash
# Install certbot
apt install -y certbot

# Create certbot directories
mkdir -p certbot/www certbot/conf

# Get certificate (make sure DNS is already pointing to your droplet)
certbot certonly --webroot -w ./certbot/www -d your-domain.com

# Update nginx config to enable HTTPS
nano nginx/conf.d/kazka.conf
# Uncomment HTTPS server block and update domain name

# Restart nginx
docker-compose -f docker-compose.prod.yml restart nginx
```

### 8. Setup SSL Auto-renewal

```bash
# Add cron job
crontab -e

# Add this line (renew at 3 AM daily):
0 3 * * * certbot renew --quiet && docker-compose -f /var/www/kazka/docker-compose.prod.yml restart nginx
```

### 9. Configure Firewall

```bash
# Install UFW if not present
apt install -y ufw

# Allow SSH, HTTP, HTTPS
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp

# Enable firewall
ufw --force enable

# Check status
ufw status
```

## Database Operations

### Backup Database

Create a backup:
```bash
cd /var/www/kazka
./scripts/db-backup.sh
```

Backups are stored in `./backups/` directory as compressed `.sql.gz` files.

### Restore Database

```bash
cd /var/www/kazka
./scripts/db-restore.sh backups/kazka_backup_YYYYMMDD_HHMMSS.sql.gz
```

### Transfer Backup from Local to Droplet

From your local machine:
```bash
scp backups/kazka_backup_*.sql.gz root@droplet-ip:/var/www/kazka/backups/
```

On droplet:
```bash
cd /var/www/kazka
./scripts/db-restore.sh backups/kazka_backup_YYYYMMDD_HHMMSS.sql.gz
```

### Schedule Automatic Backups

```bash
# Add to crontab
crontab -e

# Add this line (backup at 2 AM daily):
0 2 * * * cd /var/www/kazka && ./scripts/db-backup.sh
```

## GitHub Sync Setup

### 1. Generate SSH Key on Droplet

```bash
ssh-keygen -t ed25519 -C "deploy@kazka" -f ~/.ssh/id_ed25519 -N ""
```

### 2. Add SSH Key to GitHub

```bash
cat ~/.ssh/id_ed25519.pub
```

Copy the output and add to GitHub:
- Go to: https://github.com/sarmat2509/story/settings/keys
- Click "Add deploy key"
- Paste the public key
- Check "Allow write access" if needed
- Save

### 3. Test Git Pull

```bash
cd /var/www/kazka
git pull origin main
```

### 4. Setup GitHub Actions

Add secrets to GitHub repository (Settings → Secrets and variables → Actions):

1. **DO_SSH_PRIVATE_KEY**: Your droplet SSH private key
   ```bash
   # On your local machine (the one you use to SSH to droplet)
   cat ~/.ssh/id_rsa  # or your SSH key path
   ```

2. **DROPLET_IP**: Your droplet IP address

Once configured, pushing to `main` branch will trigger automatic deployment.

## Monitoring & Maintenance

### View Logs

```bash
# API logs
docker logs kazka-api-prod -f

# Postgres logs
docker logs kazka-postgres-prod -f

# Nginx logs
docker logs kazka-nginx -f

# All services
docker-compose -f docker-compose.prod.yml logs -f
```

### Restart Services

```bash
# Restart API only
docker-compose -f docker-compose.prod.yml restart api

# Restart all services
docker-compose -f docker-compose.prod.yml restart

# Rebuild and restart (after code changes)
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d
```

### Manual Deployment (without CI/CD)

```bash
cd /var/www/kazka
git pull origin main
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d
```

### Health Checks

```bash
# Check API health
curl http://localhost/health
curl http://localhost/api/v1/health/ready

# Check from outside
curl https://your-domain.com/health
```

### Run Pending SQL Migrations

Run all migrations that haven't been applied yet (tracked in `schema_migrations` table):

```bash
docker exec wondertales-api-prod sh -c 'cd /app/services/api && pnpm db:migrate:all'
```

### Database Management

```bash
# Connect to database
docker exec -it wondertales-postgres-prod psql -U kazka -d kazka_prod

# Create backup
./scripts/db-backup.sh

# List backups
ls -lh backups/

# Restore backup
./scripts/db-restore.sh backups/kazka_backup_YYYYMMDD_HHMMSS.sql.gz
```

### Disk Space Management

```bash
# Check disk usage
df -h

# Check Docker disk usage
docker system df

# Clean up unused Docker resources
docker system prune -a --volumes
```

## Troubleshooting

### API won't start

1. Check logs: `docker logs kazka-api-prod`
2. Check environment variables: `docker exec kazka-api-prod env | grep -E "DATABASE|JWT|GEMINI"`
3. Check database connection: `docker exec -it kazka-postgres-prod psql -U kazka -d kazka_prod -c "SELECT 1;"`

### Database connection errors

1. Check if PostgreSQL is running: `docker ps | grep postgres`
2. Check PostgreSQL logs: `docker logs kazka-postgres-prod`
3. Verify DATABASE_URL format: `postgresql://user:password@postgres:5432/database`

### SSL certificate issues

1. Check certbot logs: `cat /var/log/letsencrypt/letsencrypt.log`
2. Verify DNS is pointing to droplet: `dig your-domain.com`
3. Test certificate renewal: `certbot renew --dry-run`

### Out of memory

1. Check memory usage: `free -h`
2. Check Docker container stats: `docker stats`
3. Consider upgrading droplet size or optimizing AI service usage

## Security Best Practices

1. **Strong Secrets**: Use generated secrets (see step 4)
2. **Firewall**: UFW should only allow ports 22, 80, 443
3. **SSH Keys**: Disable password auth in `/etc/ssh/sshd_config`
4. **Regular Updates**: 
   ```bash
   apt update && apt upgrade -y
   docker-compose -f docker-compose.prod.yml pull
   ```
5. **Database Access**: PostgreSQL should only be accessible from localhost (default in config)
6. **Environment Variables**: Never commit `.env` to git
7. **Backup Rotation**: Old backups are auto-deleted (keep last 7)
8. **SSL/TLS**: Always use HTTPS in production
9. **Rate Limiting**: Already configured in Express app
10. **Secrets Rotation**: Rotate API keys quarterly

## Performance Optimization

1. **Enable HTTP/2**: Already configured in nginx
2. **Database Indexes**: Already configured in migrations
3. **Connection Pooling**: Configured in Drizzle ORM
4. **Docker Resources**: Limit container resources if needed:
   ```yaml
   # In docker-compose.prod.yml
   deploy:
     resources:
       limits:
         memory: 1G
   ```

## Backup Strategy

- **Frequency**: Daily at 2 AM (automated via cron)
- **Retention**: Last 7 backups kept automatically
- **Location**: `/var/www/kazka/backups/`
- **Off-site**: Consider copying backups to S3 or DigitalOcean Spaces

```bash
# Example: Copy to S3
aws s3 cp backups/kazka_backup_*.sql.gz s3://your-bucket/backups/
```

## Monitoring Recommendations

Consider setting up:
- **Uptime monitoring**: UptimeRobot, Pingdom
- **Error tracking**: Sentry
- **Logs aggregation**: Papertrail, Logtail
- **Performance monitoring**: New Relic, Datadog
- **DigitalOcean Monitoring**: Enable in droplet settings

## Scaling Considerations

When you need more capacity:
1. **Vertical Scaling**: Resize droplet (more CPU/RAM)
2. **Database Optimization**: Add read replicas
3. **Caching**: Add Redis for API responses
4. **CDN**: Use DigitalOcean Spaces + CDN for static assets
5. **Load Balancing**: Multiple API instances behind load balancer
6. **Separate Services**: Move PostgreSQL to managed database

## Support & Resources

- GitHub Repository: https://github.com/sarmat2509/story
- DigitalOcean Docs: https://docs.digitalocean.com/
- Docker Docs: https://docs.docker.com/
- Let's Encrypt: https://letsencrypt.org/docs/
