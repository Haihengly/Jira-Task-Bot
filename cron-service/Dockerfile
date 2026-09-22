FROM node:20-alpine

# Create app directory
WORKDIR /app

# Copy package configurations and install dependencies
COPY package*.json ./
RUN npm install

# Copy application source
COPY src/ ./src/

# Create the data directory to match the volume mount point
RUN mkdir -p /app/data && chown -R node:node /app

# Run as non-root user for security
USER node

# Start the cron service
CMD ["node", "src/index.js"]
