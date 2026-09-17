# ==========================================
# Stage 1: Build the Angular application
# ==========================================
FROM node:20-alpine AS build
WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./

# Install exact dependencies cleanly
RUN npm ci

# Copy application source files
COPY . ./

# Build production bundle
RUN npm run build -- --configuration production

# ==========================================
# Stage 2: Serve with Nginx
# ==========================================
FROM nginx:alpine

# Remove default Nginx website configuration and static files
RUN rm -rf /etc/nginx/conf.d/* /usr/share/nginx/html/*

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy Angular production build artifacts to Nginx doc root
COPY --from=build /app/dist/r-front-project/browser /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
