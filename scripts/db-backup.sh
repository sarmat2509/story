#!/bin/bash
# Database backup script

# Load environment variables
set -a
source .env
set +a

BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/kazka_backup_${TIMESTAMP}.sql"

# Create backup directory if not exists
mkdir -p $BACKUP_DIR

echo "Creating database backup..."
pg_dump $DATABASE_URL > $BACKUP_FILE

if [ $? -eq 0 ]; then
    echo "Backup created successfully: $BACKUP_FILE"
    
    # Compress backup
    gzip $BACKUP_FILE
    echo "Compressed: ${BACKUP_FILE}.gz"
    
    # Keep only last 7 backups
    ls -t ${BACKUP_DIR}/kazka_backup_*.sql.gz | tail -n +8 | xargs rm -f
    echo "Old backups cleaned up"
else
    echo "Backup failed!"
    exit 1
fi
