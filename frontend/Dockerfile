FROM node:20-bullseye-slim

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Work around npm 10.8+ exit handler bug in container builds.
RUN npm install -g npm@10.7.0

# Install dependencies
RUN npm ci

# Copy application code
COPY . .

# Expose port
EXPOSE 5173

# Start development server
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
