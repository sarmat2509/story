#!/bin/bash
# Database restore script

if [ -z "$1" ]; then
    echo "Usage: ./scripts/db-restore.sh <backup_file.sql.gz>"
    echo "Available backups:"
    ls -lh backups/
    exit 1
fi

BACKUP_FILE=$1

# Load environment variables
set -a
source .env
set +a

echo "WARNING: This will OVERWRITE the current database!"
read -p "Are you sure? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Restore cancelled"
    exit 0
fi

echo "Restoring database from $BACKUP_FILE..."

# Decompress if needed
if [[ $BACKUP_FILE == *.gz ]]; then
    gunzip -c $BACKUP_FILE | psql $DATABASE_URL
else
    psql $DATABASE_URL < $BACKUP_FILE
fi

if [ $? -eq 0 ]; then
    echo "Database restored successfully!"
else
    echo "Restore failed!"
    exit 1
fi
