# Dockerfile para desarrollo local del proyecto Lovable (TanStack Start + Vite + Bun)
FROM oven/bun:1.2 AS base
WORKDIR /app

# 1) Instalar dependencias primero (mejor cache de capas)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# 2) Copiar el resto del código
COPY . .

# Vite/TanStack Start por defecto sirve en el puerto 3000
ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000

# Modo desarrollo (hot reload). Para producción habría que generar antes
# un build (bun run build) y ajustar el preset de Nitro (ver README-DOCKER.md)
CMD ["bun", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]
