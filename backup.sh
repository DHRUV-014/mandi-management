#!/bin/bash

# ── Mandi Management System — Daily Backup Script ─────────────
# Backs up the SQLite database to AWS S3
# Set up: crontab -e → add line:
#   0 2 * * * /bin/bash /home/ubuntu/MANDI/backup.sh >> /home/ubuntu/logs/backup.log 2>&1

APP_DIR="/home/ubuntu/MANDI"
DB_FILE="$APP_DIR/app.db"
S3_BUCKET="s3://YOUR-S3-BUCKET-NAME/backups"
DATE=$(date +%Y-%m-%d_%H-%M)
BACKUP_NAME="mandi-backup-$DATE.db"
LOG_DIR="/home/ubuntu/logs"

mkdir -p "$LOG_DIR"

echo "[$DATE] Starting backup..."

# Check DB file exists
if [ ! -f "$DB_FILE" ]; then
  echo "[$DATE] ERROR: Database file not found at $DB_FILE"
  exit 1
fi

# Copy DB to temp file (safe copy while app is running)
cp "$DB_FILE" "/tmp/$BACKUP_NAME"

# Upload to S3
aws s3 cp "/tmp/$BACKUP_NAME" "$S3_BUCKET/$BACKUP_NAME"

if [ $? -eq 0 ]; then
  echo "[$DATE] Backup successful: $BACKUP_NAME"
else
  echo "[$DATE] ERROR: S3 upload failed"
  exit 1
fi

# Clean up temp file
rm "/tmp/$BACKUP_NAME"

# Delete backups older than 30 days from S3
aws s3 ls "$S3_BUCKET/" | awk '{print $4}' | while read -r file; do
  FILE_DATE=$(echo "$file" | grep -oP '\d{4}-\d{2}-\d{2}')
  if [ -n "$FILE_DATE" ]; then
    DAYS_OLD=$(( ( $(date +%s) - $(date -d "$FILE_DATE" +%s) ) / 86400 ))
    if [ "$DAYS_OLD" -gt 30 ]; then
      aws s3 rm "$S3_BUCKET/$file"
      echo "[$DATE] Deleted old backup: $file"
    fi
  fi
done

echo "[$DATE] Backup complete."
