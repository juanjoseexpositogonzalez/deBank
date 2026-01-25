#!/bin/bash

# Script para iniciar facilitador y backend x402

set -e

echo "🚀 Starting x402 services for dBank..."

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar que estamos en el directorio correcto
if [ ! -d "facilitator" ] || [ ! -d "backend" ]; then
    echo "❌ Error: facilitator/ or backend/ directories not found"
    echo "   Please run this script from the dBank root directory"
    exit 1
fi

# Verificar que existen los .env
if [ ! -f "facilitator/.env" ]; then
    echo "${YELLOW}⚠️  facilitator/.env not found, copying from .env.example${NC}"
    cp facilitator/.env.example facilitator/.env
    echo "   Please configure facilitator/.env before continuing"
fi

if [ ! -f "backend/.env" ]; then
    echo "${YELLOW}⚠️  backend/.env not found, copying from .env.example${NC}"
    cp backend/.env.example backend/.env
    echo "   Please configure backend/.env before continuing"
fi

# Instalar dependencias si no existen
if [ ! -d "facilitator/node_modules" ]; then
    echo "📦 Installing facilitator dependencies..."
    cd facilitator && npm install && cd ..
fi

if [ ! -d "backend/node_modules" ]; then
    echo "📦 Installing backend dependencies..."
    cd backend && npm install && cd ..
fi

# Iniciar facilitador en background
echo "${GREEN}🔧 Starting facilitator on port 4022...${NC}"
cd facilitator
npm start > ../facilitator.log 2>&1 &
FACILITATOR_PID=$!
cd ..

sleep 2

# Verificar que el facilitador está corriendo
if ! kill -0 $FACILITATOR_PID 2>/dev/null; then
    echo "❌ Failed to start facilitator. Check facilitator.log for errors"
    exit 1
fi

echo "${GREEN}✅ Facilitator started (PID: $FACILITATOR_PID)${NC}"

# Iniciar backend en background
echo "${GREEN}🔧 Starting backend on port 4021...${NC}"
cd backend
npm start > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

sleep 2

# Verificar que el backend está corriendo
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo "❌ Failed to start backend. Check backend.log for errors"
    kill $FACILITATOR_PID 2>/dev/null || true
    exit 1
fi

echo "${GREEN}✅ Backend started (PID: $BACKEND_PID)${NC}"

echo ""
echo "${GREEN}✨ x402 services are running!${NC}"
echo ""
echo "Facilitator: http://localhost:4022"
echo "Backend:     http://localhost:4021"
echo ""
echo "Logs:"
echo "  - Facilitator: tail -f facilitator.log"
echo "  - Backend:     tail -f backend.log"
echo ""
echo "To stop services:"
echo "  kill $FACILITATOR_PID $BACKEND_PID"
echo ""

# Función para cleanup al salir
cleanup() {
    echo ""
    echo "🛑 Stopping x402 services..."
    kill $FACILITATOR_PID $BACKEND_PID 2>/dev/null || true
    wait $FACILITATOR_PID $BACKEND_PID 2>/dev/null || true
    echo "✅ Services stopped"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Esperar a que el usuario presione Ctrl+C
echo "Press Ctrl+C to stop services..."
wait
