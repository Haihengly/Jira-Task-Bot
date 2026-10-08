#!/bin/bash
# usage: ./test-cron.sh morning|evening
if [[ "$1" != "morning" && "$1" != "evening" ]]; then
  echo "usage: bash test-cron.sh morning|evening"
  exit 1
fi
docker compose run --rm cron-service node src/index.js --run=$1 --user=7845153640