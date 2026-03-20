# ---------- Build stage ----------
FROM node:latest AS builder

WORKDIR /

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source
COPY tsconfig.json ./
COPY ./ ./

# Build TypeScript
RUN npm run build


# ---------- Production stage ----------
FROM node:latest

WORKDIR /

# Copy only necessary files
COPY package*.json ./
RUN npm install --omit=dev

# Copy compiled output from builder
COPY --from=builder /build ./
